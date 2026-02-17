# DubaiApp (GitHub Actions ile APK)

## 1) Repo yapısı
- App.js
- index.js
- package.json
- app.json
- assets/
  - icon.png
  - splash.png
  - splash-icon.png (opsiyonel)
  - intro_bg.jpg

> Not: Bu repo **assets/adaptive-icon.png** ve **assets/favicon.png** istemiyor (app.json’dan kaldırıldı). Bu yüzden dosya eksikliği yüzünden build patlamaz.

## 2) GitHub Actions ile APK alma
1. Dosyaları repo’ya koy.
2. `.github/workflows/android-apk.yml` dosyası zaten hazır.
3. GitHub → Actions → **Android Standalone APK (Release)** → Run workflow.
4. Bittiğinde “Artifacts” kısmından **app-release** indir.

## 3) Sende çıkan hataların sebebi (kısa)
- `Dependencies lock file is not found` → workflow’da `cache: npm` vardı ama repo’da `package-lock.json` yoktu.
- app.json içinde `adaptive-icon.png` ve `favicon.png` isteniyordu ama assets’te yoktu.

Bu pakette ikisi de düzeltildi.

## 4) Termux (sıfırdan kurulum)
```bash
pkg update -y && pkg upgrade -y
pkg install -y git nodejs-lts
node -v
npm -v

# repo klonla
git clone <REPO_URL>
cd <REPO_FOLDER>

# bağımlılıklar
npm install

# lokal test (istersen)
npx expo start
```

## 5) Intro arka plan resmi nerede?
App.js içinde Intro ekranında:
```js
<ImageBackground source={require('./assets/intro_bg.jpg')} ... />
```
`intro_bg.jpg` dosyası `assets/` klasöründe olmalı.
