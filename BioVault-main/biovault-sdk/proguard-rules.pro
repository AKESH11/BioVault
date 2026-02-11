# Keep all public SDK classes and methods
-keep public class com.biovault.sdk.** { *; }

# Keep native methods
-keepclasseswithmembernames class * {
    native <methods>;
}

# Keep BioVaultCameraProcessor native methods
-keepclassmembers class com.biovault.sdk.BioVaultCameraProcessor {
    native <methods>;
}

# Keep callback interfaces
-keep interface com.biovault.sdk.BiometricCallback { *; }

# Keep data classes
-keep class com.biovault.sdk.BioSignature { *; }
-keep class com.biovault.sdk.BioVaultConfig { *; }
-keep class com.biovault.sdk.BioVaultConfig$Builder { *; }

# Keep SDK entry point
-keep class com.biovault.sdk.BioVaultSDK {
    public *;
}

# Preserve line numbers for debugging
-keepattributes SourceFile,LineNumberTable

# OpenCV
-keep class org.opencv.** { *; }

# AndroidX
-keep class androidx.** { *; }
-dontwarn androidx.**
