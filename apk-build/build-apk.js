const path = require('path');
const fs = require('fs');

async function main() {
  const { TwaManifest } = require('@bubblewrap/core/dist/lib/TwaManifest');
  const { TwaGenerator } = require('@bubblewrap/core/dist/lib/TwaGenerator');
  const { GradleWrapper } = require('@bubblewrap/core/dist/lib/GradleWrapper');
  const { AndroidSdkTools } = require('@bubblewrap/core/dist/lib/androidSdk/AndroidSdkTools');
  const { Config } = require('@bubblewrap/core/dist/lib/Config');
  const { JdkHelper } = require('@bubblewrap/core/dist/lib/jdk/JdkHelper');
  const { ConsoleLog } = require('@bubblewrap/core/dist/lib/Log');

  const HOME = process.env.USERPROFILE || process.env.HOME;
  const JDK_PATH = path.join(HOME, '.bubblewrap', 'jdk', 'jdk-17.0.11+9');
  const SDK_PATH = path.join(HOME, '.bubblewrap', 'androidSdk');
  const TARGET_DIR = __dirname;
  const KEYSTORE = path.join(TARGET_DIR, 'android.keystore');

  const log = new ConsoleLog('build');

  console.log('=== OptiNote APK Build ===\n');

  // 1. Create TWA manifest from web manifest
  console.log('[1/5] Chargement du manifest...');
  const twaManifest = await TwaManifest.fromWebManifest(
    'https://jarod256.github.io/audit-terrain/manifest.json'
  );

  twaManifest.packageId = 'com.optinote.app';
  twaManifest.name = 'OptiNote';
  twaManifest.launcherName = 'OptiNote';
  twaManifest.enableNotifications = true;
  twaManifest.signingKey = { path: KEYSTORE, alias: 'optinote' };
  twaManifest.appVersionCode = 1;
  twaManifest.appVersionName = '1.0.0';
  twaManifest.minSdkVersion = 21;
  twaManifest.orientation = 'portrait';
  twaManifest.fallbackType = 'customtabs';

  // Save manifest
  await twaManifest.saveToFile(path.join(TARGET_DIR, 'twa-manifest.json'));
  console.log('   Manifest sauvegarde.');

  // 2. Generate TWA project
  console.log('[2/5] Generation du projet Android...');
  const generator = new TwaGenerator();
  await generator.createTwaProject(TARGET_DIR, twaManifest, log);
  console.log('   Projet genere.');

  // 3. Create keystore
  console.log('[3/5] Creation du keystore...');
  if (!fs.existsSync(KEYSTORE)) {
    const { execSync } = require('child_process');
    const keytool = path.join(JDK_PATH, 'bin', 'keytool');
    execSync(`"${keytool}" -genkeypair -alias optinote -keyalg RSA -keysize 2048 -validity 10000 -keystore "${KEYSTORE}" -storepass optinote123 -keypass optinote123 -dname "CN=OptiNote, O=OptiNote, C=FR"`, { stdio: 'inherit' });
  }
  console.log('   Keystore pret.');

  // 4. Build with Gradle
  console.log('[4/5] Compilation APK (gradle assembleRelease)...');
  const config = new Config(JDK_PATH, SDK_PATH);
  const jdkHelper = new JdkHelper(process, config);
  const androidSdk = new AndroidSdkTools(process, config, jdkHelper, log);
  const gradle = new GradleWrapper(process, androidSdk, TARGET_DIR);
  await gradle.assembleRelease();
  console.log('   Compilation terminee.');

  // 5. Sign APK
  console.log('[5/5] Signature de l\'APK...');
  const unsignedApk = path.join(TARGET_DIR, 'app', 'build', 'outputs', 'apk', 'release', 'app-release-unsigned.apk');
  const alignedApk = path.join(TARGET_DIR, 'app-release-aligned.apk');
  const signedApk = path.join(TARGET_DIR, 'app-release-signed.apk');

  if (fs.existsSync(unsignedApk)) {
    await androidSdk.zipalign(unsignedApk, alignedApk);
    await androidSdk.apksigner(KEYSTORE, 'optinote123', 'optinote', 'optinote123', alignedApk, signedApk);
    console.log('   APK signe.');
  }

  // Result
  if (fs.existsSync(signedApk)) {
    const size = (fs.statSync(signedApk).length / 1024 / 1024).toFixed(1);
    console.log(`\n========================================`);
    console.log(`   APK GENERE: app-release-signed.apk`);
    console.log(`   Taille: ${size} MB`);
    console.log(`========================================\n`);
  } else {
    console.log('\nVerification des APK dans app/build/outputs/...');
    const outputDir = path.join(TARGET_DIR, 'app', 'build', 'outputs');
    if (fs.existsSync(outputDir)) {
      const { execSync } = require('child_process');
      console.log(execSync(`dir /s /b "${outputDir}\\*.apk"`, { encoding: 'utf8' }));
    }
  }
}

main().catch((err) => {
  console.error('ERREUR:', err.message || err);
  process.exit(1);
});
