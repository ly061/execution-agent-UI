$ErrorActionPreference = "Stop"

$ProjectDir = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$VenvDir = Join-Path $ProjectDir ".venv"
$Python = Join-Path $VenvDir "Scripts\python.exe"

if (-not (Test-Path $Python)) {
    py -3.12 -m venv $VenvDir
}

& $Python -m pip install -r (Join-Path $ProjectDir "requirements.txt")
$env:PATH = "$(Join-Path $VenvDir 'Scripts');$env:PATH"
& (Join-Path $VenvDir "Scripts\pyside6-deploy.exe") -c (Join-Path $ProjectDir "pysidedeploy.spec") -f

Write-Host "QA Orbit Agent package created under $(Join-Path $ProjectDir 'dist')."
