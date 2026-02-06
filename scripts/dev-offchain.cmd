@echo off
setlocal
call "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\Common7\Tools\VsDevCmd.bat"
if errorlevel 1 exit /b 1
"%USERPROFILE%\.cargo\bin\cargo.exe" run --manifest-path backend\Cargo.toml
