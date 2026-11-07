#!/usr/bin/env python3
"""Проверка подготовленного коммита без вывода найденных секретов."""
import pathlib
import re
import subprocess
import sys


def git(*args):
    return subprocess.check_output(["git", *args], stderr=subprocess.PIPE)


def main():
    try:
        root = git("rev-parse", "--show-toplevel").decode().strip()
    except subprocess.CalledProcessError:
        print("Проверка невозможна: сначала создайте Git-репозиторий.", file=sys.stderr)
        return 2
    import os
    os.chdir(root)
    names = git("diff", "--cached", "--name-only", "--diff-filter=ACMR", "-z")
    # Значения не выводятся даже при отклонении коммита.
    assignment = re.compile(
        rb'''(?ix)(?:client[_-]?secret|soundcloud[_-]?secret|access[_-]?token|refresh[_-]?token)
        ["']?\s*[:=]\s*["']?([a-z0-9_./+\-=]{16,})'''
    )
    rejected = []
    for raw_name in names.split(b"\0"):
        if not raw_name:
            continue
        name = os.fsdecode(raw_name)
        path = pathlib.PurePosixPath(name)
        sensitive_name = (
            (path.name == ".env" or path.name.startswith(".env."))
            and path.name != ".env.example"
        ) or path.suffix.lower() in {".pem", ".key", ".p12", ".pfx"} or any(
            part in {"secrets", "credentials"} for part in path.parts
        )
        content = git("show", ":" + name)
        # Ссылки на переменные окружения в исходниках не содержат их значений.
        candidates = (match for match in assignment.finditer(content)
                      if not (match.group(1) == b"qEnvironmentVariable"
                              and content[match.end():match.end()+1] == b"(")
                      and not (match.group(1) == b"env.CLIENT_SECRET"
                               and match.group(0).endswith(b": env.CLIENT_SECRET")))
        if sensitive_name or next(candidates, None) or re.search(
            rb"-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY-----", content
        ):
            rejected.append(name)
    if rejected:
        print("Коммит остановлен: возможные секреты в файлах:", file=sys.stderr)
        for name in rejected:
            print(f"  {name!r}", file=sys.stderr)
        print("Уберите секреты из индекса; храните их вне репозитория.", file=sys.stderr)
        return 1
    print("Проверка индекса: типовые признаки секретов не найдены.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
