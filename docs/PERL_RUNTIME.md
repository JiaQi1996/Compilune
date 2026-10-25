# Private Perl runtime / 私有 Perl 运行时

Since version 0.2.10, Compilune bundles Perl 5.42.3 for its latexmk workflow. Users still install a TeX distribution separately. The bundled runtime is not a general Perl development environment or a replacement for every optional Perl/CPAN dependency used by arbitrary TeX scripts.

## Selection and isolation

| Host / toolchain | Interpreter selection |
| --- | --- |
| Windows + TeX Live | Preserve TeX Live's own Perl and wrapper environment; bundled Perl is available as a backup |
| Windows + MiKTeX | Prefer the bundled private Perl; a separate system Perl installation is unnecessary |
| macOS + MacTeX / TeX Live | Preserve a working `/usr/bin/perl`; use the bundled runtime when it is unavailable |
| macOS + MiKTeX | Prefer the bundled private Perl |
| Development build without a prepared runtime | Windows can detect an existing system Perl; release packaging requires the private runtime |

The application sets PATH only in child-process environments. It does not register, globally install, or replace Perl and does not modify registry/system PATH. For private Perl, inherited `PERL5LIB`, `PERLLIB`, `PERL5OPT` and related module-injection/build variables are removed. Files are read from the application package; users do not install CPAN modules into that directory. Working files and compiler outputs stay in the project/output directories.

On macOS, Perl scripts are launched with an explicit interpreter, while a native MiKTeX launcher remains a native process receiving the selected child environment. A native launcher must never be passed to Perl as script input. Settings show the selected interpreter's source, version, path and bundled availability.

## Architectures and placement

| App package | Bundled runtime |
| --- | --- |
| macOS arm64 | Native arm64 Perl |
| macOS x86_64 | Native x86_64 Perl; Apple Silicon build hosts need Rosetta for configuration probes |
| Windows x64 | x64 Perl from the pinned official Strawberry Perl distribution |
| Windows ARM64 | The same x64 Perl through Windows 11 x64 emulation; the application itself remains native ARM64 |

macOS places the complete relocatable runtime tree in `Compilune.app/Contents/Resources/Perl/`. Its interpreter and XS modules are individually signed before the outer bundle is sealed. Windows uses `resources/runtimes/perl/` outside ASAR so the OS can execute its EXE and load its DLLs. The runtime location is resolved from the running application's directory, not a development-machine path.

## Reproducible preparation

Versions, original source URLs, archive SHA-256 and provenance are pinned in [`scripts/perl-runtime.lock.json`](../scripts/perl-runtime.lock.json). Prepared runtimes, downloads and intermediate files remain under ignored `.build/`; do not commit generated interpreters, installers or verification dependencies.

macOS, with Command Line Tools:

```sh
bash scripts/prepare-perl-macos.sh arm64
bash scripts/prepare-perl-macos.sh x86_64
./scripts/package.sh --arch arm64
./scripts/package.sh --arch x86_64
```

Preparation builds unchanged upstream source with relocatable library paths and a static libperl, using the app's macOS 14 deployment target. `COMPILUNE_PERL_ARCHIVE` can point to a predownloaded source archive; its hash is still checked. `COMPILUNE_BUILD_JOBS` controls parallel compilation. The first build needs network access unless the verified archive is already cached. Subsequent builds reuse the prepared runtime.

Windows, from PowerShell with Node/npm dependencies installed:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\prepare-perl-windows.ps1
npm --prefix apps/windows run package
```

`-Archive C:\path\strawberry-perl-5.42.3.1-64bit.msi` or `COMPILUNE_PERL_ARCHIVE` provides an offline archive. Preparation verifies SHA-256 and administratively extracts the MSI (`msiexec /a`); it does not install Strawberry Perl into Windows. Only the interpreter, core libraries, required native modules/DLLs and notices are copied. Compiler tools, CPAN site packages, optional database/compression bindings and unrelated developer tools are omitted. Native imports must resolve to the bundled DLLs or Windows system libraries.

App packaging invokes preparation and must not silently produce a release with the runtime omitted. Public verification scripts and their dependencies are deliberately kept outside this repository.

## Licenses, updates and signing

Compilune remains MIT; the interpreter and libraries retain their original terms. See [`third_party/perl/README.md`](../third_party/perl/README.md). Runtime packages retain Perl's Artistic/GPL texts, module copyright notices, original distribution information and Windows GCC runtime/MinGW notices. `runtime.json` records version, architecture, source and archive checksum. Source availability and the standard upstream release are documented there and in the retained notices.

To update, choose an upstream maintenance release, verify the published checksum independently, update the lock and preparation recipe, remove `.build/runtimes/` for the affected target, rebuild, and validate:

- Core modules used by latexmk, including MD5, Unicode normalization, Encode, file globbing and List::Util.
- Real latexmk builds, PDF rendering, SyncTeX, cancellation and cleanup on both Windows app architectures.
- A moved macOS bundle and paths containing spaces/non-ASCII characters, including all native XS module architectures.
- Private module isolation and continued use of TeX Live's own environment.
- All package signatures and installer SHA-256 files.

macOS defaults to ad hoc signing. Set `COMPILUNE_SIGN_IDENTITY` to a Developer ID Application identity for timestamped hardened-runtime signatures, then perform Apple notarization separately. Ad hoc signature verification is not notarization and does not claim Gatekeeper approval. Windows code signing also remains a separate release step.

## 中文说明

用户选择 MiKTeX 时，不再需要另外安装 Perl。Windows ARM64 包内的 Perl 是 x64，通过系统仿真运行；Mac 两个架构分别提供原生版本。TeX Live/MacTeX 的既有可用环境继续保留。设置页显示实际来源、版本与路径，私有环境只影响应用启动的编译进程。

首次源码构建需要下载固定版本的 Perl；支持使用预下载文件，并始终校验 SHA-256。Windows 只解压官方 MSI，不执行系统安装。生成的运行时和本地验证资料不提交 GitHub。TeX 环境、宏包和任意脚本所需的其他依赖仍需单独安装；内置 Perl 并不等于内置完整 TeX Live/MiKTeX。
