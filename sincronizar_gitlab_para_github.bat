@echo off
setlocal EnableExtensions EnableDelayedExpansion
chcp 65001 >nul
cd /d "%~dp0"
title Sincronizar GitLab para GitHub - Portfolio Logistica

rem ===================================================================
rem  SINCRONIZACAO TEMPORARIA: GitLab -> GitHub
rem  - GitLab (gitlab/main) e a fonte central
rem  - GitHub (origin/main) e apenas espelho para o Cloudflare
rem  - Nao gera JSON, nao cria commit e nao altera os arquivos locais
rem  - Execute somente em uma rede que permita acesso ao GitHub
rem ===================================================================

echo ============================================================
echo  Sincronizar GitLab -^> GitHub
 echo  Fonte:   gitlab/main
 echo  Destino: origin/main
 echo ============================================================
echo.

rem --- Evita disputar o repositorio com a atualizacao automatica
if exist "logs\auto.lock" (
  echo ERRO: A atualizacao automatica esta em andamento.
  echo Aguarde o arquivo logs\auto.lock desaparecer e tente novamente.
  echo.
  pause
  exit /b 1
)

rem --- Localiza o Git
set "GIT=git"
where git >nul 2>&1
if errorlevel 1 (
  set "GIT="
  for /d %%D in ("%LOCALAPPDATA%\GitHubDesktop\app-*") do (
    if exist "%%D\resources\app\git\cmd\git.exe" set "GIT=%%D\resources\app\git\cmd\git.exe"
  )
)
if not defined GIT (
  echo ERRO: Git nao encontrado.
  pause
  exit /b 1
)

rem --- Confirma que os dois remotos existem
"%GIT%" remote get-url gitlab >nul 2>&1
if errorlevel 1 (
  echo ERRO: O remoto gitlab nao existe neste repositorio.
  pause
  exit /b 1
)
"%GIT%" remote get-url origin >nul 2>&1
if errorlevel 1 (
  echo ERRO: O remoto origin nao existe neste repositorio.
  pause
  exit /b 1
)

echo [1/4] Lendo a fonte central no GitLab...
"%GIT%" fetch gitlab main
if errorlevel 1 (
  echo.
  echo ERRO: Nao foi possivel acessar o GitLab.
  echo Verifique a rede corporativa e a autenticacao do GitLab.
  pause
  exit /b 1
)

echo.
echo [2/4] Verificando acesso ao GitHub...
"%GIT%" fetch origin main
if errorlevel 1 (
  echo.
  echo ERRO: O GitHub nao esta acessivel nesta rede.
  echo Nenhuma alteracao foi feita no GitHub.
  echo Execute este arquivo novamente em uma rede que permita github.com.
  pause
  exit /b 1
)

rem --- Mostra exatamente o que sera espelhado
echo.
echo [3/4] Versoes encontradas:
for /f %%H in ('"%GIT%" rev-parse --short refs/remotes/gitlab/main') do set "GLHASH=%%H"
for /f %%H in ('"%GIT%" rev-parse --short refs/remotes/origin/main') do set "GHHASH=%%H"
echo       GitLab: !GLHASH!
echo       GitHub: !GHHASH!

if /i "!GLHASH!"=="!GHHASH!" (
  echo.
  echo GitHub ja esta sincronizado com o GitLab. Nada a fazer.
  pause
  exit /b 0
)

echo.
echo [4/4] Espelhando gitlab/main no GitHub...
rem O --force-with-lease permite espelhar a fonte central sem sobrescrever
rem uma alteracao inesperada feita no GitHub depois do fetch acima.
"%GIT%" push origin refs/remotes/gitlab/main:refs/heads/main --force-with-lease=refs/heads/main
if errorlevel 1 (
  echo.
  echo ERRO: O GitHub recusou a sincronizacao.
  echo Nenhuma alteracao foi feita no GitLab.
  echo Verifique a mensagem acima antes de tentar novamente.
  pause
  exit /b 1
)

echo.
echo ============================================================
echo  SINCRONIZACAO CONCLUIDA
 echo  GitLab continua sendo a fonte central.
 echo  GitHub recebeu exatamente a versao de gitlab/main.
 echo  O Cloudflare podera publicar esta nova versao.
 echo ============================================================
echo.
pause
exit /b 0
