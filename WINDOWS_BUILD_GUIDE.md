# دليل تحويل المشروع إلى برنامج ويندوز قابل للتثبيت (Windows .exe)

تم تجهيز هذا المشروع بالكامل ليعمل كبرنامج سطح مكتب لنظام **Windows 10 / 11** بدون أخطاء `ESM / require` أو مشاكل مسارات `file://` أو WebAssembly (`libpag.wasm`).

## الطريقة السريعة (بضغطة زر واحدة على ويندوز)
1. تأكد من تثبيت **Node.js LTS** على جهازك (من الموقع الرسمي `https://nodejs.org`).
2. افتح مجلد المشروع واضغط مرتين (Double Click) على ملف **`build-windows.bat`**.
3. سيقوم السكريبت تلقائياً بتثبيت الحزم وبناء المشروع وإنتاج ملف التثبيت داخل مجلد **`release/`**:
   - **ملف التثبيت الكامل**: `MotionTools SVGA Pro Setup 1.0.0.exe` (ينشئ اختصار على سطح المكتب وقائمة ابدأ).
   - **نسخة محمولة بدون تثبيت**: `MotionTools SVGA Pro-Portable-1.0.0.exe`.

## الطريقة اليدوية (عبر PowerShell أو CMD)
```bash
npm install --legacy-peer-deps
npm install -D electron electron-builder --legacy-peer-deps
npm run dist:win
```

## ملاحظات تقنية مهمة (لـ ChatGPT أو أي مطوّر)
- المشروع يستخدم `"type": "module"` في `package.json`، لذلك ملفات Electron تستخدم الامتداد **`.cjs`** (`electron/main.cjs` و `electron/preload.cjs`) ومضبوطة في `"main": "electron/main.cjs"`.
- جميع مسارات الـ Build مضبوطة على `base: './'` في `vite.config.ts` ومسارات نسبية (`./`) في `index.html` و `src/`.
- يقوم `electron/main.cjs` بتشغيل خادم محلي داخلي على `127.0.0.1` (منفذ عشوائي تلقائي بدون تعارض) لتشغيل `dist/` وملفات `WASM` و`iframes` (مثل `gifts-studio.html` و`svga-to-after-effects.html`) وFirebase بنفس كفاءة المتصفح تماماً.
- إعدادات التجميع جاهزة داخل `electron-builder.yml`.
