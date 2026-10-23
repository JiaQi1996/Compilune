# Private Perl runtime notices

Compilune's own source remains MIT. Perl and its bundled libraries retain their respective licenses; they are not relicensed under MIT.

- Perl 5.42.3: Artistic License 1.0 (Perl) or GPL 1 or later. The original `Artistic`, `Copying`, copyright notices and bundled module licenses are included with the generated runtimes. Standard source: https://www.cpan.org/src/5.0/perl-5.42.3.tar.gz
- Windows files come unmodified from Strawberry Perl 5.42.3.1 x64, pinned by SHA-256 in `scripts/perl-runtime.lock.json`. Its original license directory and distribution/source information are retained. This is a runtime subset for latexmk, not a general Strawberry Perl developer installation.
- `libgcc_s_seh-1.dll` and `libstdc++-6.dll`: GCC GPLv3 with the GCC Runtime Library Exception 3.1. Original source and runtime documentation: https://gcc.gnu.org/ ; https://gcc.gnu.org/onlinedocs/libstdc++/manual/license.html
- `libwinpthread-1.dll`: retain the accompanying upstream `winpthreads-COPYING.txt`, from https://github.com/mingw-w64/mingw-w64/tree/master/mingw-w64-libraries/winpthreads

The Windows runtime omits the compiler, CPAN site distribution and database libraries. The app never installs packages into its bundled runtime. Archive checksum/provenance, selected architecture and Perl version are recorded in `runtime.json` inside each runtime. macOS compilation uses the unchanged upstream Perl source with a relocatable, non-shared-libperl configuration; normal build configuration is described in `scripts/prepare-perl-macos.sh`.

Runtime executables and downloaded archives are generated under ignored `.build/` directories, not committed to Git. See `docs/PERL_RUNTIME.md` for preparation, validation and update instructions.
