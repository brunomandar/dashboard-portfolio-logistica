@echo off
chcp 65001 >nul
rem ===================================================================
rem  Cria a tarefa no Agendador do Windows:
rem  "Dashboard Portfolio - Atualizacao automatica"
rem  Seg a Sex, a cada 15 min, das 08:00 as 18:00
rem  Rode este arquivo UMA vez (duplo clique) na pasta do dashboard.
rem ===================================================================
cd /d "%~dp0"
set "TAREFA=Dashboard Portfolio - Atualizacao automatica"
set "ALVO=%~dp0atualizar_dashboard_auto.bat"
if not exist "%ALVO%" (
  echo ERRO: atualizar_dashboard_auto.bat nao esta nesta pasta.
  pause & exit /b 1
)
schtasks /Create /F /TN "%TAREFA%" /SC WEEKLY /D MON,TUE,WED,THU,FRI /ST 08:00 /RI 15 /DU 10:00 /TR "cmd /c \"\"%ALVO%\"\"" 
if errorlevel 1 (
  echo.
  echo Nao foi possivel criar a tarefa. Veja a mensagem acima.
  pause & exit /b 1
)
echo.
echo Tarefa criada com sucesso: %TAREFA%
echo Roda de segunda a sexta, a cada 15 minutos, das 08:00 as 18:00.
echo O resultado de cada execucao fica em: logs\auto_atualizacao.log
echo.
echo Para desativar depois:  schtasks /Delete /TN "%TAREFA%" /F
pause
