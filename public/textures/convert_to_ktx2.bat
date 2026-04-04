@echo off
setlocal enabledelayedexpansion

echo =============================================
echo  PNG to KTX2 (UASTC) Batch Converter
echo =============================================
echo.

where toktx >nul 2>&1
if errorlevel 1 (
    echo ERROR: toktx not found in PATH.
    echo Download KTX-Software from: https://github.com/KhronosGroup/KTX-Software/releases
    pause
    exit /b 1
)

set COUNT=0
set ERRORS=0

for %%F in ("%~dp0*.png") do (
    set "INPUT=%%F"
    set "OUTPUT=%%~dpnF.ktx2"
    set "NAME=%%~nF"

    echo !NAME! | findstr /i "_ao" >nul
    if not errorlevel 1 (
        echo Converting AO ^(R channel, linear^): %%~nxF -^> %%~nF.ktx2
        toktx --uastc --uastc_quality 2 --genmipmap --target_type R --assign_oetf linear "!OUTPUT!" "!INPUT!"
    ) else (
        echo Converting RGB ^(sRGB^): %%~nxF -^> %%~nF.ktx2
        toktx --uastc --uastc_quality 2 --genmipmap --assign_oetf srgb "!OUTPUT!" "!INPUT!"
    )

    if errorlevel 1 (
        echo   [FAILED] %%~nxF
        set /a ERRORS+=1
    ) else (
        echo   [OK]
        set /a COUNT+=1
    )
    echo.
)

echo =============================================
echo  Done. Converted: %COUNT%   Errors: %ERRORS%
echo =============================================
pause