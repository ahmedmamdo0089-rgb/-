@echo off
chcp 65001 >nul
echo ========================================================
echo   جاري رفع التحديثات الجديدة إلى GitHub و Vercel تلقائياً
echo ========================================================
echo.

git remote set-url origin https://github.com/ahmedmamdo0089-rgb/-bank-elhz.git
git add -A
git commit -m "Transform identity to Arabian Heritage Theme: New 3D logo, Arabian tokens, Arabesque styling, Richup mobile layout, and SEO boost" 2>nul
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

