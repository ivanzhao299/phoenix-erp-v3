"""Fixed local fast-forward launcher; mechanism only, never release authority.

FD9 is duplicated by the controller, not reopened. Until one bounded GO line
arrives this process can only inspect descriptors and exit. It never unlocks
FD9; exec preserves the same open-file-description through Git's lifetime.
"""
import fcntl
import os
import re
import select
import stat
import sys


def refuse():
    sys.stderr.write("MAINTENANCE_HOLD=CHECKOUT_LAUNCHER_REFUSED\n")
    raise SystemExit(64)


def inherited_lock(lock_path):
    # An independent contender must be blocked, and a nonblocking flock on the
    # inherited description must succeed. Together these reject an unlocked FD
    # or a different open description even when the inode happens to match.
    named = os.lstat(lock_path)
    owned = os.fstat(9)
    if (not stat.S_ISREG(named.st_mode) or named.st_uid != os.getuid()
            or stat.S_IMODE(named.st_mode) != 0o600 or named.st_nlink != 1
            or (named.st_dev, named.st_ino) != (owned.st_dev, owned.st_ino)):
        refuse()
    probe = os.open(lock_path, os.O_RDONLY | os.O_NOFOLLOW)
    try:
        if (os.fstat(probe).st_dev, os.fstat(probe).st_ino) != (named.st_dev, named.st_ino):
            refuse()
        try:
            fcntl.flock(probe, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            pass
        else:
            refuse()
        # Idempotent on the original held description; NEVER LOCK_UN.
        fcntl.flock(9, fcntl.LOCK_EX | fcntl.LOCK_NB)
    finally:
        os.close(probe)


def main():
    if len(sys.argv) != 5:
        refuse()
    root, target, lock_path, token = sys.argv[1:]
    if (not os.path.isabs(root) or os.path.realpath(root) != root
            or not os.path.isabs(lock_path) or os.path.realpath(lock_path) != lock_path
            or not re.fullmatch(r"[a-f0-9]{40}", target)
            or not re.fullmatch(r"[a-f0-9]{64}", token)):
        refuse()
    inherited_lock(lock_path)
    sys.stdout.write("CHECKOUT_GATE_READY=" + token + "\n")
    sys.stdout.flush()
    ready, _, _ = select.select([0], [], [], 5)
    if not ready:
        refuse()
    # One atomic small controller write; no command body, shell or extra argv.
    command = os.read(0, 128)
    if command != ("GO " + token + "\n").encode("ascii"):
        refuse()
    inherited_lock(lock_path)
    os.set_inheritable(9, True)
    os.chdir(root)
    argv = ["/usr/bin/git", "-c", "safe.directory=" + root,
            "-c", "core.hooksPath=/dev/null", "-c", "core.fsmonitor=false",
            "-c", "gc.auto=0", "-c", "maintenance.auto=false",
            "-c", "merge.autoStash=false", "-c", "submodule.recurse=false",
            "-c", "checkout.workers=1",
            "merge", "--ff-only", "--no-overwrite-ignore", "--no-edit", target]
    os.execve(argv[0], argv, dict(os.environ))


if __name__ == "__main__":
    try:
        main()
    except SystemExit:
        raise
    except BaseException:
        refuse()
