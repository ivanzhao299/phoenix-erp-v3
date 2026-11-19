import importlib.util
import io
import json
import os
from pathlib import Path
import stat
import subprocess
import tarfile
import tempfile
import unittest

SOURCE = Path(__file__).with_name('production-cutover-runtime-tree.py').resolve()
SPEC = importlib.util.spec_from_file_location('cutover_runtime_tree', SOURCE)
TREE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(TREE)
ARTIFACTS = SOURCE.parents[2] / 'artifacts/production-inbound-installments-20261118/runtime-tree-fixtures'


class RuntimeTreeTests(unittest.TestCase):
    def setUp(self):
        ARTIFACTS.mkdir(parents=True, exist_ok=True, mode=0o700)
        self.temporary = tempfile.TemporaryDirectory(dir=ARTIFACTS)
        self.base = Path(self.temporary.name)
        self.output = self.base / 'tree'
        self.output.mkdir(mode=0o700)
        self.uid = os.getuid()

    def tearDown(self):
        self.temporary.cleanup()

    def archive(self, expected, additions=()):
        file = self.base / (expected + '.tar')
        defaults = {
            'dist': [('dist', 'directory', ''), ('dist/scripts', 'directory', ''),
                     ('dist/scripts/production-cutover-apply.js', 'file', 'exports.protocol="owned";')],
            'node_modules': [('node_modules', 'directory', ''), ('node_modules/.pnpm', 'directory', ''),
                             ('node_modules/.pnpm/owned', 'directory', ''),
                             ('node_modules/.pnpm/owned/index.js', 'file', 'module.exports=42;'),
                             ('node_modules/owned', 'symlink', '.pnpm/owned')],
            'package.json': [('package.json', 'file', json.dumps({'name': getattr(self, 'package_name', 'owned-fixture'), 'private': True}))],
        }
        with tarfile.open(file, 'w') as archive:
            for name, kind, value in [*defaults[expected], *additions]:
                info = tarfile.TarInfo(name)
                info.uid = 555
                info.mode = 0o7777  # Source ownership, mode, setuid and capabilities do not become authority.
                info.type = {'file': tarfile.REGTYPE, 'directory': tarfile.DIRTYPE,
                             'symlink': tarfile.SYMTYPE, 'hardlink': tarfile.LNKTYPE,
                             'fifo': tarfile.FIFOTYPE}[kind]
                if kind in ('hardlink', 'symlink'):
                    info.linkname = value
                data = value.encode() if kind == 'file' else b''
                info.size = len(data)
                archive.addfile(info, io.BytesIO(data) if kind == 'file' else None)
        file.chmod(0o600)
        return file

    def materialize(self, additions=None):
        additions = additions or {}
        archives = {key: self.archive(key, additions.get(key, ())) for key in TREE.ROOTS}
        return TREE.materialize(archives, self.output, self.uid, getattr(self, 'workspace_observation', None))

    def observed_missing_workspace(self):
        self.workspace_observation = {'schema': 'phoenix.cutover-runtime-workspace-target/1', 'containerId': 'c' * 64,
            'imageId': 'sha256:' + 'd' * 64, 'targetPath': '/workspace/apps/api', 'referencePath': '/app/package.json',
            'targetStatus': 404, 'referenceStatus': 200}

    def test_complete_pnpm_tree_and_hardlinks_become_private_independent_files(self):
        result = self.materialize({'node_modules': [('node_modules/copied.js', 'hardlink', 'node_modules/.pnpm/owned/index.js')]})
        self.assertEqual(result.pop('sourceTransformations'), [])
        self.assertEqual(result, TREE.collect_tree(self.output, self.uid))
        self.assertEqual((self.output / 'node_modules/owned/index.js').read_text(), 'module.exports=42;')
        for relative in ['node_modules/copied.js', 'node_modules/.pnpm/owned/index.js']:
            s = (self.output / relative).stat()
            self.assertEqual((s.st_uid, stat.S_IMODE(s.st_mode), s.st_nlink), (self.uid, 0o600, 1))
        self.assertNotEqual((self.output / 'node_modules/copied.js').stat().st_ino,
                            (self.output / 'node_modules/.pnpm/owned/index.js').stat().st_ino)

    def test_duplicate_and_noncanonical_paths_reject_before_materialization(self):
        for bad in ['../outside', '/absolute', 'dist/../alias', 'dist//alias', 'dist/./alias', 'dist/back\\slash', 'dist/secret\nline', 'dist/scripts/production-cutover-apply.js']:
            with self.subTest(bad=bad):
                with self.assertRaisesRegex(ValueError, 'CUTOVER_RUNTIME_HOLD='):
                    self.materialize({'dist': [(bad, 'file', 'PRIVATE-OWNED-CANARY')]})
                self.assertEqual(list(self.output.iterdir()), [])

    def test_archive_roots_and_explicit_parent_directories_are_required(self):
        for extra in [[('other/file', 'file', 'x')], [('dist/missing/file', 'file', 'x')],
                      [('dist/alias', 'symlink', 'scripts'), ('dist/alias/injected.js', 'file', 'x')]]:
            with self.subTest(extra=extra):
                with self.assertRaisesRegex(ValueError, 'CUTOVER_RUNTIME_HOLD='):
                    self.materialize({'dist': extra})
                self.assertEqual(list(self.output.iterdir()), [])

    def test_hardlink_external_missing_and_cycle_graphs_reject_before_writes(self):
        for extra in [[('dist/link', 'hardlink', '../../outside')], [('dist/link', 'hardlink', 'dist/missing')],
                      [('dist/a', 'hardlink', 'dist/b'), ('dist/b', 'hardlink', 'dist/a')],
                      [('dist/link', 'hardlink', 'node_modules/owned')]]:
            with self.subTest(extra=extra):
                with self.assertRaisesRegex(ValueError, 'CUTOVER_RUNTIME_HOLD='):
                    self.materialize({'dist': extra})
                self.assertEqual(list(self.output.iterdir()), [])

    def test_special_files_reject_before_any_write(self):
        with self.assertRaisesRegex(ValueError, 'ARCHIVE_TYPE'):
            self.materialize({'dist': [('dist/fifo', 'fifo', '')]})
        self.assertEqual(list(self.output.iterdir()), [])

    def test_symlink_escape_dangling_and_cycles_never_produce_verified_trees(self):
        for target in ['/etc', '../../../outside', 'missing', 'bad']:
            with self.subTest(target=target), tempfile.TemporaryDirectory(dir=self.base) as temporary:
                output = Path(temporary)
                archives = {key: self.archive(key, [('node_modules/bad', 'symlink', target)] if key == 'node_modules' else []) for key in TREE.ROOTS}
                with self.assertRaisesRegex(ValueError, 'LINK_'):
                    TREE.materialize(archives, output, self.uid)

    def test_transitive_link_cannot_leave_the_tree_then_return_through_an_unhashed_parent(self):
        extra = [('dist/deep', 'directory', ''), ('dist/deep/up', 'symlink', '..'),
                 ('dist/deep/bad', 'symlink', 'up/../../tree/node_modules/owned')]
        with self.assertRaisesRegex(ValueError, 'LINK_ESCAPE'):
            self.materialize({'dist': extra})
        self.assertEqual(list(self.output.iterdir()), [])

    def test_verification_requires_a_regular_package_and_regular_compiled_entry(self):
        self.materialize()
        package = self.output / 'package.json'
        package.unlink()
        package.mkdir(mode=0o700)
        with self.assertRaisesRegex(ValueError, 'ROOT_TYPES_REQUIRED'):
            TREE.collect_tree(self.output, self.uid)
        package.rmdir()
        package.write_text('{}')
        package.chmod(0o600)
        entry = self.output / 'dist/scripts/production-cutover-apply.js'
        entry.unlink()
        entry.symlink_to('../../node_modules/owned/index.js')
        with self.assertRaisesRegex(ValueError, 'ROOT_TYPES_REQUIRED'):
            TREE.collect_tree(self.output, self.uid)

    def test_extension_metadata_is_bounded_before_tarfile_parses_it(self):
        archives = {key: self.archive(key) for key in TREE.ROOTS}
        for kind in [tarfile.XHDTYPE, tarfile.XGLTYPE, tarfile.SOLARIS_XHDTYPE, tarfile.GNUTYPE_LONGNAME, tarfile.GNUTYPE_LONGLINK]:
            with self.subTest(kind=kind):
                header = tarfile.TarInfo('OwnedPax')
                header.type = kind
                header.size = TREE.MAX_EXTENSION_BYTES + 1
                archives['dist'].write_bytes(header.tobuf() + bytes(1024))
                with self.assertRaisesRegex(ValueError, 'ARCHIVE_EXTENSION_LIMIT'):
                    TREE.materialize(archives, self.output, self.uid)
                self.assertEqual(list(self.output.iterdir()), [])

    def test_raw_archive_bytes_are_bounded_before_header_parsing(self):
        archives = {key: self.archive(key) for key in TREE.ROOTS}
        with archives['dist'].open('r+b') as output:
            output.truncate(TREE.MAX_ARCHIVE_BYTES + 512)
        with self.assertRaisesRegex(ValueError, 'ARCHIVE_BYTES_LIMIT'):
            TREE.materialize(archives, self.output, self.uid)
        self.assertEqual(list(self.output.iterdir()), [])

    def test_failed_preflight_closes_the_original_inode_even_when_error_tracebacks_are_retained(self):
        failures = []
        before = len(os.listdir('/proc/self/fd'))
        for _ in range(8):
            archives = {part: self.archive(part) for part in TREE.ROOTS}
            header = tarfile.TarInfo('OwnedPax')
            header.type = tarfile.XHDTYPE
            header.size = TREE.MAX_EXTENSION_BYTES + 1
            archives['dist'].write_bytes(header.tobuf() + bytes(1024))
            try:
                TREE.materialize(archives, self.output, self.uid)
            except ValueError as failure:
                failures.append(failure)
            else:
                self.fail('Oversized extension must fail')
            self.assertEqual(len(os.listdir('/proc/self/fd')), before)
        self.assertEqual(len(failures), 8)

    def test_pax_cannot_change_prechecked_block_boundaries_or_invoke_sparse_parsers(self):
        for key in ['size', 'GNU.sparse.map', 'GNU.sparse.major']:
            with self.subTest(key=key):
                archives = {part: self.archive(part) for part in TREE.ROOTS}
                payload = key.encode() + b'=0\n'
                length = len(payload) + 2
                while len(str(length)) + 1 + len(payload) != length:
                    length = len(str(length)) + 1 + len(payload)
                payload = str(length).encode() + b' ' + payload
                header = tarfile.TarInfo('OwnedPax')
                header.type = tarfile.XHDTYPE
                header.size = len(payload)
                archives['dist'].write_bytes(header.tobuf() + payload + bytes((-len(payload)) % 512) + bytes(1024))
                with self.assertRaisesRegex(ValueError, 'ARCHIVE_PAX_BOUNDARY_OVERRIDE'):
                    TREE.materialize(archives, self.output, self.uid)
                self.assertEqual(list(self.output.iterdir()), [])

    def test_bounded_standard_pax_long_paths_remain_supported(self):
        relative = 'node_modules/' + 'a' * 180 + '.js'
        result = self.materialize({'node_modules': [(relative, 'file', 'module.exports=45;')]})
        self.assertIn(relative, [row['path'] for row in result['entries']])

    def test_long_hardlink_graph_resolves_once_and_writes_independent_files(self):
        links = [('node_modules/link-' + str(i), 'hardlink',
                  'node_modules/link-' + str(i + 1) if i < 299 else 'node_modules/.pnpm/owned/index.js') for i in range(300)]
        result = self.materialize({'node_modules': links})
        self.assertEqual(len([row for row in result['entries'] if row['path'].startswith('node_modules/link-')]), 300)
        self.assertEqual((self.output / 'node_modules/link-0').read_text(), 'module.exports=42;')
        self.assertEqual((self.output / 'node_modules/link-0').stat().st_nlink, 1)

    def test_only_the_exact_build_workspace_self_link_has_an_explicit_recorded_projection(self):
        self.observed_missing_workspace()
        self.package_name = 'phoenix-erp-v3-nest'
        result = self.materialize({'node_modules': [('node_modules/.pnpm/node_modules', 'directory', ''),
                                  (TREE.BUILD_SELF_LINK, 'symlink', TREE.BUILD_SELF_TARGET)]})
        self.assertEqual(result['sourceTransformations'], [TREE.BUILD_SELF_TRANSFORM])
        self.assertFalse(os.path.lexists(self.output / TREE.BUILD_SELF_LINK))
        with tarfile.open(self.base / 'node_modules.tar') as original:
            self.assertEqual(original.getmember(TREE.BUILD_SELF_LINK).linkname, TREE.BUILD_SELF_TARGET)

    def test_other_links_cannot_resolve_indirectly_through_the_removed_workspace_self_link(self):
        self.observed_missing_workspace()
        self.package_name = 'phoenix-erp-v3-nest'
        extra = [('node_modules/.pnpm/node_modules', 'directory', ''),
                 (TREE.BUILD_SELF_LINK, 'symlink', TREE.BUILD_SELF_TARGET),
                 ('node_modules/indirect', 'symlink', '.pnpm/node_modules/phoenix-erp-v3-nest')]
        with self.assertRaisesRegex(ValueError, 'LINK_DANGLING'):
            self.materialize({'node_modules': extra})
        self.assertEqual(list(self.output.iterdir()), [])

    def test_build_self_link_path_with_another_target_or_type_is_never_silently_dropped(self):
        self.package_name = 'phoenix-erp-v3-nest'
        for kind, target in [('symlink', '../../../../other'), ('file', 'owned')]:
            with self.subTest(kind=kind), self.assertRaisesRegex(ValueError, 'BUILD_SELF_LINK_CHANGED'):
                self.materialize({'node_modules': [('node_modules/.pnpm/node_modules', 'directory', ''),
                                                   (TREE.BUILD_SELF_LINK, kind, target)]})
            self.assertEqual(list(self.output.iterdir()), [])

    def test_build_self_link_projection_requires_the_exact_root_package_identity(self):
        self.observed_missing_workspace()
        with self.assertRaisesRegex(ValueError, 'BUILD_SELF_PACKAGE_REQUIRED'):
            self.materialize({'node_modules': [('node_modules/.pnpm/node_modules', 'directory', ''),
                                               (TREE.BUILD_SELF_LINK, 'symlink', TREE.BUILD_SELF_TARGET)]})
        self.assertEqual(list(self.output.iterdir()), [])

    def test_workspace_link_projection_requires_a_separate_actual_absence_observation(self):
        self.package_name = 'phoenix-erp-v3-nest'
        extra = [('node_modules/.pnpm/node_modules', 'directory', ''), (TREE.BUILD_SELF_LINK, 'symlink', TREE.BUILD_SELF_TARGET)]
        with self.assertRaisesRegex(ValueError, 'BUILD_SELF_TARGET_ABSENCE_REQUIRED'):
            self.materialize({'node_modules': extra})
        self.observed_missing_workspace()
        self.workspace_observation['targetStatus'] = 200
        with self.assertRaisesRegex(ValueError, 'BUILD_SELF_TARGET_ABSENCE_REQUIRED'):
            self.materialize({'node_modules': extra})
        self.assertEqual(list(self.output.iterdir()), [])

    def test_bytes_and_new_members_change_the_complete_tree_digest(self):
        before = self.materialize()
        entry = self.output / 'node_modules/.pnpm/owned/index.js'
        entry.write_text('module.exports=43;')
        after = TREE.collect_tree(self.output, self.uid)
        self.assertNotEqual(before['treeSha256'], after['treeSha256'])
        extra = self.output / 'node_modules/unreviewed.js'
        extra.write_text('module.exports=44;')
        extra.chmod(0o600)
        self.assertNotEqual(after['treeSha256'], TREE.collect_tree(self.output, self.uid)['treeSha256'])

    def test_world_writes_and_external_hardlinks_cannot_enter_the_closure(self):
        self.materialize()
        file = self.output / 'node_modules/.pnpm/owned/index.js'
        file.chmod(0o622)
        with self.assertRaisesRegex(ValueError, 'FILE_MODE_OR_HARDLINK'):
            TREE.collect_tree(self.output, self.uid)
        file.chmod(0o600)
        os.link(file, self.base / 'external-link')
        with self.assertRaisesRegex(ValueError, 'FILE_MODE_OR_HARDLINK'):
            TREE.collect_tree(self.output, self.uid)

    def test_only_the_three_runtime_roots_and_the_real_compiled_entry_are_accepted(self):
        self.materialize()
        extra = self.output / 'outside'
        extra.mkdir(mode=0o700)
        with self.assertRaisesRegex(ValueError, 'EXACT_TREE_ROOTS'):
            TREE.collect_tree(self.output, self.uid)
        extra.rmdir()
        (self.output / 'dist/scripts/production-cutover-apply.js').unlink()
        with self.assertRaisesRegex(ValueError, 'COMPILED_ENTRY_AND_ROOT_TYPES_REQUIRED'):
            TREE.collect_tree(self.output, self.uid)

    def test_archive_symlinks_are_never_followed(self):
        archives = {key: self.archive(key) for key in TREE.ROOTS}
        link = self.base / 'alias.tar'
        link.symlink_to(archives['dist'].name)
        archives['dist'] = link
        with self.assertRaisesRegex(ValueError, 'ARCHIVE_FILE'):
            TREE.materialize(archives, self.output, self.uid)
        self.assertEqual(list(self.output.iterdir()), [])

    def test_nonempty_destination_is_retained_and_refused(self):
        sentinel = self.output / 'sentinel'
        sentinel.write_text('owned')
        with self.assertRaisesRegex(ValueError, 'EMPTY_OUTPUT'):
            self.materialize()
        self.assertEqual(sentinel.read_text(), 'owned')

    def test_cli_has_no_unprivileged_or_arbitrary_path_override_and_redacts_failures(self):
        for args in [['verify', str(self.output)], ['materialize', 'PRIVATE-OWNED-CANARY'], []]:
            result = subprocess.run(['/usr/bin/python3', '-I', '-S', str(SOURCE), *args], capture_output=True, text=True)
            self.assertEqual(result.returncode, 2)
            self.assertEqual(result.stdout, '')
            self.assertRegex(result.stderr, r'^CUTOVER_RUNTIME_HOLD=[A-Z_]+\n$')
            self.assertNotIn('PRIVATE-OWNED-CANARY', result.stderr)


if __name__ == '__main__':
    unittest.main(verbosity=2)
