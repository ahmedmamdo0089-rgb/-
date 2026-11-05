@echo off
chcp 65001 >nul
echo ========================================================
echo   جاري رفع التحديثات الجديدة إلى GitHub و Vercel تلقائياً
echo ========================================================
echo.

git remote set-url origin https://github.com/ahmedmamdo0089-rgb/-bank-elhz.git
git add -A
git commit -m "Implement Party Mode (قعدة مع الأصدقاء) with real-life dares, synchronized voting, custom challenges, Richup mobile UI layout, and v6.0 engine" 2>nul
echo.
echo جاري الدفع إلى GitHub (main)...
git push -u origin main --force

echo.
if %ERRORLEVEL% equ 0 (
    echo ========================================================
    echo   [تم بنجاح!] تم رفع كافة الملفات بنجاح إلى GitHub!
    echo   ستقوم Vercel الآن ببناء اللعبة وتحديث الرابط فوراً.
    echo ========================================================
) else (
    echo ========================================================
    echo   [تنبيه] يرجى تسجيل الدخول بحساب GitHub إذا طُلب منك ذلك.
    echo ========================================================
)

echo.
pause

