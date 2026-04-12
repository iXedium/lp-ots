@echo off
setlocal EnableDelayedExpansion

set "UASTC_QUALITY=2"
set "UASTC_RDO=0.5"
set "ZSTD_LEVEL=6"

set "UASTC_NORMAL_QUALITY=4"
set "UASTC_NORMAL_RDO=0.35"
set "ZSTD_NORMAL_LEVEL=6"

echo =============================================
echo  PNG to KTX2 Converter with texture presets
echo =============================================
echo  General UASTC Quality:   %UASTC_QUALITY%
echo  General UASTC RDO:       %UASTC_RDO%
echo  Normal UASTC Quality:    %UASTC_NORMAL_QUALITY%
echo  Normal UASTC RDO:        %UASTC_NORMAL_RDO%
echo  General Zstd Level:      %ZSTD_LEVEL%
echo  Normal Zstd Level:       %ZSTD_NORMAL_LEVEL%
echo.

where toktx >nul 2>&1
if errorlevel 1 (
    echo ERROR: toktx not found in PATH.
    echo Download KTX-Software from:
    echo https://github.com/KhronosGroup/KTX-Software/releases
    pause
    exit /b 1
)

set COUNT=0
set ERRORS=0

for %%F in ("%~dp0*.png") do (
    set "INPUT=%%F"
    set "OUTPUT=%%~dpnF.ktx2"
    set "NAME=%%~nF"
    set "TYPE=UNKNOWN"

    echo Processing: %%~nxF

    echo !NAME! | findstr /i "_ao _occlusion" >nul
    if not errorlevel 1 set "TYPE=AO"

    if "!TYPE!"=="UNKNOWN" (
        echo !NAME! | findstr /i "_normal _nrm _nor" >nul
        if not errorlevel 1 set "TYPE=NORMAL"
    )

    if "!TYPE!"=="UNKNOWN" (
        echo !NAME! | findstr /i "_roughness _rough _metallic _metalness _specular _gloss _glossiness _mask _orm _rma _arm _mra _packed" >nul
        if not errorlevel 1 set "TYPE=DATA"
    )

    if "!TYPE!"=="UNKNOWN" (
        echo !NAME! | findstr /i "_diffuse _albedo _basecolor _base_color _color _colour _combined _lm _lightmap _emissive" >nul
        if not errorlevel 1 set "TYPE=COLOR"
    )

    if "!TYPE!"=="AO" (
        echo   Type: AO / Occlusion ^(UASTC, R, linear^)
        toktx --t2 --encode uastc --uastc_quality %UASTC_QUALITY% --uastc_rdo_l %UASTC_RDO% --zcmp %ZSTD_LEVEL% --genmipmap --target_type R --assign_oetf linear --assign_primaries none "!OUTPUT!" "!INPUT!"
    ) else if "!TYPE!"=="NORMAL" (
		echo   Type: Normal ^(UASTC, linear, normal mode, tuned defaults^)
		toktx --t2 --encode uastc --uastc_quality %UASTC_NORMAL_QUALITY% --uastc_rdo_l %UASTC_NORMAL_RDO% --zcmp %ZSTD_NORMAL_LEVEL% --assign_oetf linear --normal_mode --normalize "!OUTPUT!" "!INPUT!"
    ) else if "!TYPE!"=="DATA" (
        echo   Type: Data / packed map ^(UASTC, linear^)
        toktx --t2 --encode uastc --uastc_quality %UASTC_QUALITY% --uastc_rdo_l %UASTC_RDO% --zcmp %ZSTD_LEVEL% --genmipmap --assign_oetf linear --assign_primaries none "!OUTPUT!" "!INPUT!"
    ) else if "!TYPE!"=="COLOR" (
        echo   Type: Colour / lightmap ^(UASTC, sRGB^)
        toktx --t2 --encode uastc --uastc_quality %UASTC_QUALITY% --uastc_rdo_l %UASTC_RDO% --zcmp %ZSTD_LEVEL% --genmipmap --assign_oetf srgb "!OUTPUT!" "!INPUT!"
    ) else (
        echo   Type: Unknown fallback ^(UASTC, sRGB^)
        toktx --t2 --encode uastc --uastc_quality %UASTC_QUALITY% --uastc_rdo_l %UASTC_RDO% --zcmp %ZSTD_LEVEL% --genmipmap --assign_oetf srgb "!OUTPUT!" "!INPUT!"
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