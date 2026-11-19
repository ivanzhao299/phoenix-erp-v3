"""Closed image runtime tree. No application loading, database, or activation.

The host caller supplies root/FD9, image, source and directory authority. Pure
functions also support isolated owned fixtures; the CLI accepts only the fixed
root-private layout and UID 0, and never extracts via tarfile.extract().
"""
import errno
import hashlib
import json
import os
import pathlib
import re
import stat
import sys
import tarfile

ROOTS = ('dist', 'node_modules', 'package.json')
MAX_ENTRIES = 200000
MAX_BYTES = 2 * 1024 ** 3
MAX_ARCHIVE_BYTES = 512 * 1024 ** 2
MAX_EXTENSION_BYTES = 64 * 1024
SCHEMA = 'phoenix.production-cutover-runtime-tree/1'
BUILD_SELF_LINK = 'node_modules/.pnpm/node_modules/phoenix-erp-v3-nest'
BUILD_SELF_TARGET = '../../../../workspace/apps/api'
BUILD_SELF_TRANSFORM = {'kind': 'DROP_UNRESOLVABLE_BUILD_WORKSPACE_SELF_LINK',
                        'path': BUILD_SELF_LINK, 'target': BUILD_SELF_TARGET}


def hold(code):
    raise ValueError('CUTOVER_RUNTIME_HOLD=' + code)


def canonical(value):
    return json.dumps(value, sort_keys=True, ensure_ascii=False, separators=(',', ':')).encode()


def digest(value):
    return hashlib.sha256(canonical(value)).hexdigest()


def name(value, directory=False):
    if directory and value.endswith('/'):
        value = value[:-1]
    if (not value or '\\' in value or any(ord(c) < 32 or ord(c) == 127 for c in value)
            or any(p in ('', '.', '..') for p in value.split('/'))):
        hold('ARCHIVE_PATH')
    return value


def identity(s):
    return (s.st_dev, s.st_ino, s.st_uid, s.st_gid, s.st_mode, s.st_nlink,
            s.st_size, s.st_mtime_ns, s.st_ctime_ns)


def no_acl(file):
    for attribute in ('system.posix_acl_access', 'system.posix_acl_default', 'security.capability'):
        try:
            os.getxattr(file, attribute, follow_symlinks=False)
        except OSError as error:
            if error.errno == errno.ENODATA:
                continue
            # Linux does not support POSIX ACLs/capabilities on the link inode.
            # Keep unsupported metadata on regular files/directories a hard error.
            if error.errno == errno.EOPNOTSUPP and stat.S_ISLNK(os.lstat(file).st_mode):
                continue
            hold('EXTENDED_METADATA_UNREADABLE')
        hold('EXTENDED_METADATA')


def root_identity(root, uid):
    s = os.lstat(root)
    if (not stat.S_ISDIR(s.st_mode) or pathlib.Path(root).resolve(strict=True) != pathlib.Path(root)
            or s.st_uid != uid or stat.S_IMODE(s.st_mode) != 0o700):
        hold('TREE_ROOT')
    no_acl(root)
    # No bind mounts, including a bind of the same filesystem, can enter the closure.
    for line in pathlib.Path('/proc/self/mountinfo').read_text().splitlines():
        mount = re.sub(r'\\([0-7]{3})', lambda m: chr(int(m[1], 8)), line.split(' - ')[0].split()[4])
        if mount == str(root) or mount.startswith(str(root) + '/'):
            hold('TREE_MOUNT')
    return identity(s)


def hash_file(file, initial):
    fd = os.open(file, os.O_RDONLY | os.O_NOFOLLOW)
    try:
        if identity(os.fstat(fd)) != identity(initial):
            hold('FILE_REPLACED')
        h = hashlib.sha256()
        while True:
            block = os.read(fd, 1024 * 1024)
            if not block:
                break
            h.update(block)
        if identity(os.fstat(fd)) != identity(initial) or identity(os.lstat(file)) != identity(initial):
            hold('FILE_CHANGED')
        return h.hexdigest()
    finally:
        os.close(fd)


def validate_graph(entries):
    index = {row['path']: row for row in entries}
    if set(p.split('/')[0] for p in index) != set(ROOTS):
        hold('EXACT_TREE_ROOTS')
    required = {'dist': 'directory', 'node_modules': 'directory', 'package.json': 'file',
                'dist/scripts': 'directory', 'dist/scripts/production-cutover-apply.js': 'file'}
    if any(index.get(key, {}).get('type') != kind for key, kind in required.items()):
        hold('COMPILED_ENTRY_AND_ROOT_TYPES_REQUIRED')
    for row in entries:
        if row['type'] != 'symlink':
            continue
        # Resolve the complete component graph from the registered members only.
        # Never consult an unrecorded outside path, even for a temporary '..' hop.
        pending, resolved, expansions = row['path'].split('/'), [], 0
        while pending:
            part = pending.pop(0)
            if part in ('', '.'):
                continue
            if part == '..':
                if not resolved:
                    hold('LINK_ESCAPE')
                resolved.pop()
                continue
            current = '/'.join([*resolved, part])
            member = index.get(current)
            if member is None:
                hold('LINK_DANGLING')
            if member['type'] == 'symlink':
                target = member['target']
                if not target or os.path.isabs(target) or '\\' in target or any(ord(c) < 32 or ord(c) == 127 for c in target):
                    hold('LINK_TARGET')
                expansions += 1
                if expansions > 40:
                    hold('LINK_CYCLE_OR_DEPTH')
                pending = target.split('/') + pending
            else:
                resolved.append(part)
                if pending and member['type'] != 'directory':
                    hold('LINK_NON_DIRECTORY_PREFIX')


def preflight_tar(stream, size):
    # tarfile processes PAX/GNU extension headers before yielding a member. Bound
    # those bytes before invoking it, without reading regular member contents.
    if size > MAX_ARCHIVE_BYTES or size % 512 or size < 1024:
        hold('ARCHIVE_BYTES_LIMIT')
    offset, headers, extensions = 0, 0, 0
    while offset + 512 <= size:
        stream.seek(offset)
        block = stream.read(512)
        if block == bytes(512):
            if offset + 1024 > size:
                hold('ARCHIVE_END')
            while True:
                padding = stream.read(1024 * 1024)
                if not padding:
                    break
                if any(padding):
                    hold('ARCHIVE_TRAILING_DATA')
            stream.seek(0)
            return
        header = tarfile.TarInfo.frombuf(block, 'utf-8', 'surrogateescape')
        headers += 1
        if header.size < 0 or header.size > MAX_BYTES or headers > MAX_ENTRIES * 3:
            hold('ARCHIVE_LIMIT')
        extension_types = (tarfile.XHDTYPE, tarfile.XGLTYPE, tarfile.SOLARIS_XHDTYPE, tarfile.GNUTYPE_LONGNAME, tarfile.GNUTYPE_LONGLINK)
        if header.type not in (*extension_types, tarfile.REGTYPE, tarfile.AREGTYPE, tarfile.CONTTYPE,
                               tarfile.DIRTYPE, tarfile.LNKTYPE, tarfile.SYMTYPE):
            hold('ARCHIVE_TYPE')
        if header.type in (tarfile.DIRTYPE, tarfile.LNKTYPE, tarfile.SYMTYPE) and header.size:
            hold('ARCHIVE_NON_FILE_SIZE')
        if header.type in extension_types:
            extensions += header.size
            if header.size > MAX_EXTENSION_BYTES or extensions > 8 * 1024 ** 2:
                hold('ARCHIVE_EXTENSION_LIMIT')
        if header.type in (tarfile.XHDTYPE, tarfile.XGLTYPE, tarfile.SOLARIS_XHDTYPE):
            payload = stream.read(header.size)
            position = 0
            while position < len(payload):
                space = payload.find(b' ', position)
                if space < 0 or not re.fullmatch(rb'[1-9][0-9]{0,6}', payload[position:space]):
                    hold('ARCHIVE_PAX_RECORD')
                end = position + int(payload[position:space])
                if end <= space + 1 or end > len(payload) or payload[end - 1:end] != b'\n':
                    hold('ARCHIVE_PAX_RECORD')
                key_value = payload[space + 1:end - 1].split(b'=', 1)
                if len(key_value) != 2:
                    hold('ARCHIVE_PAX_RECORD')
                # Prevent PAX from changing the block boundaries checked above,
                # or invoking sparse parsers that read hidden extension blocks.
                if key_value[0] == b'size' or key_value[0].startswith(b'GNU.sparse.'):
                    hold('ARCHIVE_PAX_BOUNDARY_OVERRIDE')
                position = end
        offset += 512 + ((header.size + 511) // 512) * 512
    hold('ARCHIVE_TRUNCATED')


def collect_tree(root, uid=0):
    root = pathlib.Path(root)
    before = root_identity(root, uid)
    entries, pins, total = [], {}, 0

    def visit(directory):
        nonlocal total
        for entry in sorted(os.scandir(directory), key=lambda e: e.name):
            file = pathlib.Path(entry.path)
            relative = file.relative_to(root).as_posix()
            name(relative)
            s = os.lstat(file)
            if s.st_uid != uid or s.st_dev != before[0]:
                hold('TREE_OWNER_OR_DEVICE')
            no_acl(file)
            pins[relative] = identity(s)
            row = {'path': relative}
            if stat.S_ISDIR(s.st_mode):
                if stat.S_IMODE(s.st_mode) != 0o700:
                    hold('DIRECTORY_MODE')
                row.update(type='directory', mode=0o700)
            elif stat.S_ISREG(s.st_mode):
                if stat.S_IMODE(s.st_mode) != 0o600 or s.st_nlink != 1:
                    hold('FILE_MODE_OR_HARDLINK')
                total += s.st_size
                if total > MAX_BYTES:
                    hold('TREE_SIZE')
                row.update(type='file', mode=0o600, bytes=s.st_size, sha256=hash_file(file, s))
            elif stat.S_ISLNK(s.st_mode):
                if s.st_nlink != 1:
                    hold('LINK_HARDLINK')
                target = os.readlink(file)
                row.update(type='symlink', target=target)
            else:
                hold('SPECIAL_FILE')
            entries.append(row)
            if len(entries) > MAX_ENTRIES:
                hold('TREE_ENTRIES')
            if row['type'] == 'directory':
                visit(file)

    visit(root)
    validate_graph(entries)
    after = {}
    for directory, dirs, files in os.walk(root, followlinks=False):
        for child in dirs + files:
            file = pathlib.Path(directory, child)
            after[file.relative_to(root).as_posix()] = identity(os.lstat(file))
    if pins != after or root_identity(root, uid) != before:
        hold('TREE_CHANGED')
    entries.sort(key=lambda row: row['path'])
    result = {'schema': SCHEMA, 'entries': entries, 'totalBytes': total}
    return {**result, 'treeSha256': digest(result)}


def materialize(archives, root, uid=0, workspace_observation=None):
    """All archive headers and hardlink graphs are checked before creating members.
    Hardlinks become independent regular files; no archived ACL/owner/mode is used.
    """
    root = pathlib.Path(root)
    before = root_identity(root, uid)
    if any(root.iterdir()) or set(archives) != set(ROOTS):
        hold('EMPTY_OUTPUT_AND_THREE_ARCHIVES_REQUIRED')
    opened, members, total, transformations = [], {}, 0, []
    try:
        for expected in ROOTS:
            archive = pathlib.Path(archives[expected])
            s = os.lstat(archive)
            if not stat.S_ISREG(s.st_mode) or s.st_uid != uid or s.st_nlink != 1 or stat.S_IMODE(s.st_mode) != 0o600:
                hold('ARCHIVE_FILE')
            no_acl(archive)
            # Keep the opened inode, not a later path lookup, as the archive reader.
            stream = os.fdopen(os.open(archive, os.O_RDONLY | os.O_NOFOLLOW), 'rb')
            if identity(os.fstat(stream.fileno())) != identity(s):
                stream.close()
                hold('ARCHIVE_CHANGED')
            preflight_tar(stream, s.st_size)
            reader = tarfile.open(fileobj=stream, mode='r:')
            opened.append((reader, stream, archive, s))
            for member in reader:
                member_name = name(member.name, member.isdir())
                if member_name.split('/')[0] != expected or member_name in members or member.issparse():
                    hold('ARCHIVE_ROOT_DUPLICATE_OR_SPARSE')
                if not (member.isdir() or member.isreg() or member.issym() or member.islnk()):
                    hold('ARCHIVE_TYPE')
                if expected == 'package.json' and (member_name != expected or not member.isreg()):
                    hold('PACKAGE_FILE_REQUIRED')
                if member.size < 0:
                    hold('ARCHIVE_LIMIT')
                if member.isreg():
                    total += member.size
                if total > MAX_BYTES or len(members) >= MAX_ENTRIES:
                    hold('ARCHIVE_LIMIT')
                members[member_name] = (reader, member)
        for member_name, (_, member) in members.items():
            parent = pathlib.PurePosixPath(member_name).parent.as_posix()
            if parent != '.' and (parent not in members or not members[parent][1].isdir()):
                hold('EXPLICIT_DIRECTORY_PARENT_REQUIRED')
            if member_name in ('dist', 'node_modules') and not member.isdir():
                hold('ROOT_DIRECTORY_REQUIRED')
        if not set(ROOTS).issubset(members):
            hold('EXACT_TREE_ROOTS')
        # pnpm deploy includes this build-workspace self-link in the actual API
        # image. It has no runtime target. This one reviewed projection is explicit
        # in the receipt; original archive hashes remain bound by the host. No
        # other broken/outside link is allowed or silently removed.
        if BUILD_SELF_LINK in members:
            _, member = members[BUILD_SELF_LINK]
            if not member.issym() or member.linkname != BUILD_SELF_TARGET:
                hold('BUILD_SELF_LINK_CHANGED')
            observation = workspace_observation or {}
            if (set(observation) != {'schema', 'containerId', 'imageId', 'targetPath', 'referencePath', 'targetStatus', 'referenceStatus'}
                    or observation.get('schema') != 'phoenix.cutover-runtime-workspace-target/1'
                    or not re.fullmatch(r'[a-f0-9]{64}', observation.get('containerId', ''))
                    or not re.fullmatch(r'sha256:[a-f0-9]{64}', observation.get('imageId', ''))
                    or observation.get('targetPath') != '/workspace/apps/api' or observation.get('referencePath') != '/app/package.json'
                    or observation.get('referenceStatus') != 200 or observation.get('targetStatus') != 404):
                hold('BUILD_SELF_TARGET_ABSENCE_REQUIRED')
            reader, package = members['package.json']
            if package.size > 1024 * 1024:
                hold('PACKAGE_FILE_REQUIRED')
            with reader.extractfile(package) as source:
                if json.loads(source.read()).get('name') != 'phoenix-erp-v3-nest':
                    hold('BUILD_SELF_PACKAGE_REQUIRED')
            del members[BUILD_SELF_LINK]
            transformations.append(dict(BUILD_SELF_TRANSFORM))
        validate_graph([{'path': key, 'type': 'directory' if member.isdir() else 'symlink' if member.issym() else 'file',
                         **({'target': member.linkname} if member.issym() else {})} for key, (_, member) in members.items()])
        resolved_files, output_bytes = {}, 0
        for member_name, (reader, member) in members.items():
            if member.isdir() or member.issym():
                continue
            chain, visited = [member_name], {member_name}
            while member.islnk():
                target = name(member.linkname)
                if target not in members or target in visited:
                    hold('HARDLINK_TARGET_OR_CYCLE')
                visited.add(target)
                if target in resolved_files:
                    reader, member = resolved_files[target]
                    break
                chain.append(target)
                reader, member = members[target]
            if not member.isreg():
                hold('HARDLINK_REGULAR_TARGET_REQUIRED')
            for key in chain:
                resolved_files[key] = (reader, member)
        output_bytes = sum(member.size for _, member in resolved_files.values())
        if output_bytes > MAX_BYTES:
            hold('ARCHIVE_LIMIT')
        for member_name, (_, member) in sorted(members.items(), key=lambda item: (item[0].count('/'), item[0])):
            if member.isdir():
                os.mkdir(root / member_name, 0o700)
        for member_name, (reader, member) in resolved_files.items():
            source = reader.extractfile(member)
            fd = os.open(root / member_name, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
            with source, os.fdopen(fd, 'wb') as output:
                while True:
                    block = source.read(1024 * 1024)
                    if not block:
                        break
                    output.write(block)
                output.flush()
                os.fsync(output.fileno())
        for member_name, (_, member) in members.items():
            if member.issym():
                os.symlink(member.linkname, root / member_name)
        for _, stream, archive, s in opened:
            if identity(os.fstat(stream.fileno())) != identity(s) or identity(os.lstat(archive)) != identity(s):
                hold('ARCHIVE_CHANGED')
        # Creating children legitimately changes the root timestamps, never its inode, owner or mode.
        if root_identity(root, uid)[:5] != before[:5]:
            hold('OUTPUT_REPLACED')
        for directory, _, _ in os.walk(root, topdown=False, followlinks=False):
            fd = os.open(directory, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
            try:
                os.fsync(fd)
            finally:
                os.close(fd)
        return {**collect_tree(root, uid), 'sourceTransformations': transformations}
    finally:
        for reader, stream, _, _ in opened:
            reader.close()
            stream.close()


def main():
    if os.getuid() != 0 or len(sys.argv) != 3 or sys.argv[1] not in ('materialize', 'verify'):
        hold('ROOT_HOST_REQUIRED')
    base = sys.argv[2]
    if not re.fullmatch(r'/var/lib/phoenix-erp/production-deployment-state/cutover-runtime-[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}', base):
        hold('FIXED_HOST_LAYOUT_REQUIRED')
    root = pathlib.Path(base, 'tree')
    if sys.argv[1] == 'materialize':
        def private_json(relative):
            file = pathlib.Path(base, relative)
            s = os.lstat(file)
            if not stat.S_ISREG(s.st_mode) or s.st_uid != 0 or s.st_nlink != 1 or stat.S_IMODE(s.st_mode) != 0o600 or s.st_size > 65536:
                hold('PRIVATE_SOURCE_OBSERVATION_REQUIRED')
            fd = os.open(file, os.O_RDONLY | os.O_NOFOLLOW)
            try:
                if identity(os.fstat(fd)) != identity(s):
                    hold('PRIVATE_SOURCE_OBSERVATION_CHANGED')
                value = json.loads(os.read(fd, 65537))
                if identity(os.fstat(fd)) != identity(s) or identity(os.lstat(file)) != identity(s):
                    hold('PRIVATE_SOURCE_OBSERVATION_CHANGED')
                return value
            finally:
                os.close(fd)
        observed, created = private_json('workspace-target.json'), private_json('created-container.json')
        if observed.get('containerId') != created.get('containerId') or observed.get('imageId') != created.get('imageId'):
            hold('PRIVATE_SOURCE_OBSERVATION_BINDING')
        result = materialize({key: pathlib.Path(base, key + '.tar') for key in ROOTS}, root, workspace_observation=observed)
    else:
        result = collect_tree(root)
    sys.stdout.buffer.write(canonical(result) + b'\n')


if __name__ == '__main__':
    try:
        main()
    except Exception as failure:
        # No tar member, filesystem path, JSON body or module content enters diagnostics.
        code = str(failure) if isinstance(failure, ValueError) and re.fullmatch(r'CUTOVER_RUNTIME_HOLD=[A-Z_]+', str(failure)) else 'CUTOVER_RUNTIME_HOLD=TREE_OPERATION_FAILED'
        print(code, file=sys.stderr)
        sys.exit(2)
