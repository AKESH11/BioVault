# Building BioVault SDK as AAR

## Option 1: Build from Command Line

```bash
cd biovault-sdk
gradle assembleRelease

# AAR output location:
# build/outputs/aar/biovault-sdk-release.aar
```

## Option 2: Build from Root Project

1. Add to root `settings.gradle`:
```gradle
include ':biovault-sdk'
```

2. Build:
```bash
cd BioVault-main
gradle :biovault-sdk:assembleRelease
```

## Option 3: Integrate into Existing Android Project

1. Copy entire `biovault-sdk/` folder to your project root

2. Add to `settings.gradle`:
```gradle
include ':app', ':biovault-sdk'
```

3. Add to app's `build.gradle`:
```gradle
dependencies {
    implementation project(':biovault-sdk')
}
```

4. Sync and build:
```bash
gradle assembleRelease
```

## Using Pre-built AAR

If you have a pre-built AAR file:

1. Copy `biovault-sdk-release.aar` to `app/libs/`

2. Add to app's `build.gradle`:
```gradle
repositories {
    flatDir {
        dirs 'libs'
    }
}

dependencies {
    implementation(name: 'biovault-sdk-release', ext: 'aar')
    
    // Add SDK dependencies manually:
    implementation 'androidx.appcompat:appcompat:1.6.1'
    implementation 'androidx.camera:camera-core:1.3.1'
    implementation 'androidx.camera:camera-camera2:1.3.1'
    implementation 'androidx.camera:camera-lifecycle:1.3.1'
}
```

## Publishing to Maven (Optional)

To publish to Maven Central or private repository:

1. Add to `biovault-sdk/build.gradle`:
```gradle
apply plugin: 'maven-publish'

publishing {
    publications {
        release(MavenPublication) {
            from components.release
            groupId = 'com.biovault'
            artifactId = 'sdk'
            version = '1.0.0'
        }
    }
    
    repositories {
        maven {
            url = "https://your-maven-repo.com/releases"
            credentials {
                username = project.findProperty("mavenUser")
                password = project.findProperty("mavenPassword")
            }
        }
    }
}
```

2. Publish:
```bash
gradle publish
```

## Testing the SDK

See `INTEGRATION_EXAMPLE.java` for complete integration code.

Quick test:
```java
BioVaultSDK.startCapture(this, new BiometricCallback() {
    @Override
    public void onCaptureComplete(BioSignature sig) {
        Log.i("Test", "BPM: " + sig.getBPM());
    }
    // ... implement other methods
});
```

## AAR Contents

The built AAR includes:
- ✅ Native libraries (libBioVaultCore.so for arm64-v8a, x86_64)
- ✅ Java classes (BioVaultSDK, BioSignature, callbacks, etc.)
- ✅ AndroidManifest.xml with required permissions
- ✅ Resources (if any)

AAR size: ~5-10 MB (includes OpenCV native libs)

## Troubleshooting

### CMake not found
Install CMake 3.22.1 via Android SDK Manager.

### OpenCV not found
Ensure `mobile-app/third_party/OpenCV-android-sdk` exists.

### Native library not loaded
Check that ABIs match (arm64-v8a for modern devices).

### JNI error
Verify package name matches: `com.biovault.sdk`
