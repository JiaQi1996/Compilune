param([string]$Archive='')
$ErrorActionPreference='Stop'
# Keep preparation probes independent of the developer's Perl/CPAN environment.
foreach($name in @('PERL5LIB','PERLLIB','PERL5OPT','PERL5SHELL','PERL_LOCAL_LIB_ROOT','PERL_MB_OPT','PERL_MM_OPT')) {
 Remove-Item "Env:$name" -ErrorAction SilentlyContinue
}
$repo=Split-Path $PSScriptRoot -Parent
$lock=Get-Content (Join-Path $PSScriptRoot 'perl-runtime.lock.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$spec=$lock.windows
$output=Join-Path $repo '.build\runtimes\windows-x64\perl'
$metadata=Join-Path $output 'runtime.json'
if(Test-Path $metadata) {
 $previous=Get-Content $metadata -Raw -Encoding UTF8 | ConvertFrom-Json
 if($previous.archiveSHA256 -eq $spec.sha256) {
  & "$output\bin\perl.exe" -MFile::Path -MFile::Temp -MCwd -MDigest::MD5 -MUnicode::Normalize -MEncode -MFile::Glob -MList::Util -e 'exit 0'
  if($LASTEXITCODE -eq 0) { Write-Output "Private Perl ready: $output"; exit 0 }
 }
}
$cache=Join-Path $repo '.build\perl-cache'
New-Item -ItemType Directory -Force $cache | Out-Null
if(-not $Archive) { $Archive=$env:COMPILUNE_PERL_ARCHIVE }
if(-not $Archive) {
 $Archive=Join-Path $cache 'strawberry-perl-5.42.3.1-64bit.msi'
 if(-not(Test-Path $Archive)) { Invoke-WebRequest -UseBasicParsing -Uri $spec.url -OutFile $Archive }
}
$actual=(Get-FileHash -LiteralPath $Archive -Algorithm SHA256).Hash.ToLowerInvariant()
if($actual -ne $spec.sha256) {throw 'Private Perl archive SHA-256 mismatch. Remove the corrupt download and retry.'}
$work=Join-Path $env:TEMP ('compilune-perl-'+[guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Force $work | Out-Null
try {
 $msi=Join-Path $work 'perl.msi'
 Copy-Item -LiteralPath $Archive -Destination $msi
 $extracted=Join-Path $work 'extracted'
 $process=Start-Process msiexec.exe -ArgumentList @('/a',"`"$msi`"",'/qn',"TARGETDIR=`"$extracted`"",'/l*v',"`"$work\extract.log`"") -PassThru -Wait
 if($process.ExitCode -ne 0) {throw "Perl administrative extraction failed: $($process.ExitCode). No system Perl was installed."}
 $source=Join-Path $extracted 'Strawberry'
 $stage=Join-Path $work 'Relocated Runtime\perl'
 New-Item -ItemType Directory -Force "$stage\bin","$stage\lib","$stage\Licenses" | Out-Null
 foreach($name in @('perl.exe','perl542.dll','libgcc_s_seh-1.dll','libstdc++-6.dll','libwinpthread-1.dll')) {
  Copy-Item "$source\perl\bin\$name" "$stage\bin\$name"
 }
 # Core Perl libraries only: no CPAN site distribution, compiler, package manager or database libraries.
 & robocopy "$source\perl\lib" "$stage\lib" /E /COPY:DT /NFL /NDL /NJH /NJS /NP /XF *.dll *.a *.lib *.h | Out-Null
 if($LASTEXITCODE -gt 7) {throw 'Core Perl library copy failed'}
 # Include the core native modules and their transitive core dependencies.
 # Optional database/compression bindings need extra third-party libraries and are outside this runtime's scope.
 Get-ChildItem "$source\perl\lib\auto" -Recurse -Filter '*.dll' | ForEach-Object {
  $relative=$_.FullName.Substring(("$source\perl\lib\").Length)
  if($relative -notmatch '^auto\\(DB_File|NDBM_File|GDBM_File|Compress\\Raw|XS)\\') {
   $destination=Join-Path "$stage\lib" $relative
   New-Item -ItemType Directory -Force (Split-Path $destination -Parent) | Out-Null
   Copy-Item $_.FullName $destination
  }
 }
 Copy-Item "$source\licenses\*" "$stage\Licenses" -Recurse
 Copy-Item "$source\DISTRIBUTIONS.txt","$source\README.txt" "$stage\Licenses"
 Copy-Item "$repo\third_party\perl\*" "$stage\Licenses" -Recurse
 if(Test-Path "$source\c\share\licenses") {Copy-Item "$source\c\share\licenses" "$stage\Licenses\toolchain" -Recurse}
 # Preserve core module copyright/license material as shipped by Strawberry Perl.
 $spec | ConvertTo-Json -Depth 4 | Set-Content "$stage\Licenses\UPSTREAM.json" -Encoding UTF8
 @{schema=1;version=$spec.version;platform='win32';architecture='x64';archiveSHA256=$spec.sha256;distribution=$spec.distribution;source=$spec.source;relocatable=$true;scope='latexmk and its core Perl dependencies';arm64='Windows 11 x64 emulation'} |
  ConvertTo-Json | Set-Content "$stage\runtime.json" -Encoding UTF8
 $previousPath=$env:Path
 $env:Path="$stage\bin;$env:SystemRoot\System32;$env:SystemRoot"
 try {
  & "$stage\bin\perl.exe" -MFile::Path -MFile::Temp -MFile::Spec -MFile::Copy -MFile::Find -MCwd -MTime::HiRes -MDigest::MD5 -MUnicode::Normalize -MEncode -MFile::Glob -MList::Util -e 'print $^V'
  if($LASTEXITCODE) {throw 'Relocated private Perl module check failed'}
 } finally {$env:Path=$previousPath}
 New-Item -ItemType Directory -Force (Split-Path $output -Parent) | Out-Null
 if(Test-Path $output) {Remove-Item $output -Recurse -Force}
 Move-Item $stage $output
 Write-Output "Prepared private Perl: $output"
} finally {
 if(Test-Path $work) {Remove-Item $work -Recurse -Force -ErrorAction SilentlyContinue}
}
