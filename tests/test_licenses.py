import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import tarfile
import io
import unittest

spec = importlib.util.spec_from_file_location('licenses', Path(__file__).parents[1] / 'scripts/check_licenses.py')
licenses = importlib.util.module_from_spec(spec)
spec.loader.exec_module(licenses)


class ComplianceTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.payload = self.root / 'payload'
        self.payload.mkdir()
        (self.payload / 'app').write_bytes(b'example binary')
        (self.payload / 'NOTICE').write_text('Example copyright and license')
        with tarfile.open(self.root / 'source.tar', 'w') as archive:
            for name, data in [('src/main.cpp', b'int main() { return 0; }'), ('README.md', b'Build with a C++ compiler')]:
                entry = tarfile.TarInfo(name); entry.size = len(data)
                archive.addfile(entry, io.BytesIO(data))
        self.data = {'files': {p.name: {'sha256': licenses.digest(p), 'components': ['app']} for p in self.payload.iterdir()},
                     'components': {'app': {'license': 'GPL-3.0-only', 'notice': 'payload/NOTICE', 'source': 'source.tar',
                                            'source_sha256': licenses.digest(self.root / 'source.tar')}}}
        self.manifest = self.root / 'compliance.json'

    def run_check(self):
        self.manifest.write_text(json.dumps(self.data))
        return licenses.check(self.payload, self.manifest)

    def test_complete_inventory(self):
        self.assertEqual(self.run_check(), (2, 1))

    def test_unlisted_file_rejected(self):
        (self.payload / 'extra.dll').write_bytes(b'unknown')
        with self.assertRaises(ValueError): self.run_check()

    def test_changed_binary_rejected(self):
        (self.payload / 'app').write_bytes(b'changed')
        with self.assertRaises(ValueError): self.run_check()

    def test_gpl2_only_rejected(self):
        self.data['components']['app']['license'] = 'GPL-2.0-only'
        with self.assertRaises(ValueError): self.run_check()

    def test_missing_source_rejected(self):
        (self.root / 'source.tar').unlink()
        with self.assertRaises(ValueError): self.run_check()

    def test_binary_instead_of_sources_rejected(self):
        source = self.root / 'source.tar'
        source.write_bytes(b'not source archive')
        self.data['components']['app']['source_sha256'] = licenses.digest(source)
        with self.assertRaises((ValueError, tarfile.TarError)): self.run_check()

    def test_packaged_upstream_sources(self):
        upstream = self.root / 'source.tar'
        container = self.root / 'package.tar'
        with tarfile.open(container, 'w') as archive:
            archive.add(upstream, arcname='upstream.tar')
        licenses.source_archive(container)

    def test_nested_binary_archive_rejected(self):
        binary = self.root / 'binary.tar'
        with tarfile.open(binary, 'w') as archive:
            archive.add(self.payload / 'app', arcname='library.dll')
        container = self.root / 'package.tar'
        with tarfile.open(container, 'w') as archive:
            archive.add(binary, arcname='upstream.tar')
        with self.assertRaises(ValueError): licenses.source_archive(container)

    def test_path_escape_rejected(self):
        self.data['components']['app']['source'] = '../source.tar'
        with self.assertRaises(ValueError): self.run_check()


if __name__ == '__main__': unittest.main()
