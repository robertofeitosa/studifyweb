@echo off
setlocal EnableExtensions DisableDelayedExpansion
cd /d "%~dp0"

echo.
echo ==========================================
echo              STUDIFY 1.4
echo ==========================================
echo.

if not exist ".env" (
    echo [ERRO] O arquivo .env ainda nao existe.
    echo.
    echo 1. Copie .env.example e renomeie para .env
    echo 2. Preencha suas senhas e OPENAI_API_KEY
    echo 3. Execute este arquivo novamente
    echo.
    pause
    exit /b 1
)

for /f "usebackq tokens=1,* delims==" %%A in (".env") do (
    echo %%A | findstr /b /c:"#" >nul
    if errorlevel 1 (
        if not "%%A"=="" set "%%A=%%B"
    )
)

if not exist "target\Studify.jar" (
    echo Compilando o Studify pela primeira vez...
    call mvn -q -DskipTests package
    if errorlevel 1 (
        echo.
        echo [ERRO] Nao foi possivel compilar o projeto.
        echo Confira se Java 17+ e Maven estao instalados.
        echo.
        pause
        exit /b 1
    )
)

echo Iniciando o servidor do Studify...
echo Para encerrar, feche a janela chamada "Studify Server".
echo.
start "Studify Server" cmd /k java -jar "target\Studify.jar"
timeout /t 2 /nobreak >nul
start "" "http://localhost:8080"

endlocal
