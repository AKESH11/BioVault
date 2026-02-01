# 🏗️ Bio-Vault Protocol - Complete Setup Guide

## 📂 **WHERE TO PUT EACH FILE** (Beginner's Guide)

All files have been created in the correct locations. Here's the complete structure:

```
D:\PROJECTS\BioVault\
│
├── 📄 package.json                     ← Root workspace configuration
├── 📄 .gitignore                       ← Git ignore rules
├── 📄 .env.example                     ← Environment variables template
├── 📄 README.md                        ← Main documentation
│
├── 📁 mobile-app/                      ← MOBILE APPLICATION
│   ├── package.json
│   ├── App.js                          ← Main React Native app
│   ├── index.js                        ← App entry point
│   ├── app.json                        ← App configuration
│   │
│   ├── cpp/                            ← C++ CORE ENGINE
│   │   ├── CMakeLists.txt             ← Build configuration for C++
│   │   ├── include/                    ← Header files (.h)
│   │   │   ├── rppg_engine.h
│   │   │   ├── prnu_extractor.h
│   │   │   ├── crypto_utils.h
│   │   │   └── bio_vault_native.h
│   │   └── src/                        ← Implementation files (.cpp)
│   │       ├── rppg_engine.cpp
│   │       ├── prnu_extractor.cpp
│   │       ├── crypto_utils.cpp
│   │       └── bio_vault_native.cpp
│   │
│   └── android/                        ← ANDROID NATIVE BRIDGE
│       └── app/src/main/java/com/biovault/
│           ├── BioVaultModule.java    ← JNI bridge to C++
│           └── BioVaultPackage.java   ← React Native package
│
├── 📁 smart-contracts/                 ← BLOCKCHAIN CONTRACTS
│   ├── package.json
│   ├── hardhat.config.js              ← Hardhat configuration
│   ├── contracts/
│   │   ├── MediaAnchor.sol            ← Main anchoring contract
│   │   └── AuthenticityToken.sol      ← Soulbound NFT
│   ├── scripts/
│   │   └── deploy.js                  ← Deployment script
│   └── test/
│       └── MediaAnchor.test.js        ← Contract tests
│
├── 📁 zkp-circuits/                    ← ZERO-KNOWLEDGE PROOFS
│   ├── package.json
│   ├── README.md
│   ├── circuits/
│   │   ├── verify.circom              ← Main verification circuit
│   │   └── bio_match.circom           ← Biometric matching circuit
│   └── scripts/
│       ├── generate_proof.js
│       └── verify_proof.js
│
├── 📁 backend/                         ← API SERVER
│   ├── package.json
│   ├── src/
│   │   ├── index.js                   ← Server entry point
│   │   ├── utils/
│   │   │   └── logger.js
│   │   └── routes/
│   │       ├── web3.js                ← Blockchain endpoints
│   │       ├── ipfs.js                ← IPFS endpoints
│   │       ├── media.js               ← Media processing
│   │       └── zkp.js                 ← ZK proof endpoints
│
└── 📁 shared/                          ← SHARED UTILITIES
    ├── package.json
    ├── index.js
    ├── constants.js                   ← Shared constants
    ├── crypto.js                      ← Crypto utilities
    └── types.js                       ← Type definitions
```

---

## 🚀 **STEP-BY-STEP INSTALLATION** (For Beginners)

### **Prerequisites** (Install These First)

1. **Node.js** (v18 or higher)
   - Download: https://nodejs.org/
   - Verify: Open PowerShell and run: `node --version`

2. **CMake** (v3.20 or higher)
   - Download: https://cmake.org/download/
   - During installation, check "Add CMake to system PATH"
   - Verify: `cmake --version`

3. **OpenCV** (v4.5 or higher) - **IMPORTANT FOR C++**
   - **Windows**: Download from https://opencv.org/releases/
   - Extract to `C:\opencv`
   - Add to environment variables:
     - Variable: `OpenCV_DIR`
     - Value: `C:\opencv\build`
   - Add to PATH: `C:\opencv\build\x64\vc16\bin`

4. **Android Studio** (for Android builds)
   - Download: https://developer.android.com/studio
   - Install Android SDK and NDK

5. **Git**
   - Download: https://git-scm.com/
   - Verify: `git --version`

---

### **Installation Steps**

#### **1. Navigate to Project Directory**

```powershell
cd D:\PROJECTS\BioVault
```

#### **2. Install All Dependencies**

```powershell
# Install root dependencies
npm install

# Install all workspace dependencies
npm run install:all
```

This will install packages for:
- Root workspace
- mobile-app
- smart-contracts
- zkp-circuits
- backend
- shared

#### **3. Set Up Environment Variables**

```powershell
# Copy the example env file
copy .env.example .env

# Edit .env with your actual values (use notepad or VS Code)
notepad .env
```

Fill in:
- `POLYGON_RPC_URL`: Get from https://www.alchemy.com/ (free tier)
- `PRIVATE_KEY`: Your MetaMask private key (testnet wallet only!)
- `IPFS_PROJECT_ID`: Get from https://infura.io/ (free tier)

#### **4. Build the C++ Core**

```powershell
cd mobile-app\cpp

# Create build directory
mkdir build
cd build

# Configure with CMake (Windows)
cmake .. -G "Visual Studio 17 2022" -A x64

# Build
cmake --build . --config Release

cd ..\..\..
```

**If you get OpenCV errors:**
- Verify `OpenCV_DIR` is set correctly
- Try: `cmake .. -DOpenCV_DIR=C:/opencv/build`

#### **5. Compile Smart Contracts**

```powershell
cd smart-contracts

# Compile contracts
npm run compile

cd ..
```

#### **6. Start the Backend Server**

```powershell
cd backend

# Start in development mode
npm run dev

# Server will run on http://localhost:3000
```

Leave this terminal open and running.

#### **7. Test Smart Contracts** (Optional)

Open a **new PowerShell window**:

```powershell
cd D:\PROJECTS\BioVault\smart-contracts

# Run tests
npm test
```

#### **8. Deploy to Local Blockchain** (For testing)

In another PowerShell window:

```powershell
cd D:\PROJECTS\BioVault\smart-contracts

# Start local Hardhat node
npm run node
```

In **another** PowerShell window:

```powershell
cd D:\PROJECTS\BioVault\smart-contracts

# Deploy contracts
npm run deploy:local
```

#### **9. Run Mobile App** (Android)

```powershell
cd D:\PROJECTS\BioVault\mobile-app

# For Android
npm run android

# For iOS (macOS only)
npm run ios
```

---

## 🔧 **CMakeLists.txt Explanation** (C++ Build Configuration)

The `CMakeLists.txt` file is located at: `mobile-app/cpp/CMakeLists.txt`

**What it does:**
- Configures the C++ build system
- Links OpenCV library for image processing
- Sets up compiler flags and optimizations
- Configures JNI for Android integration
- Creates a shared library that React Native can call

**Key sections:**

```cmake
find_package(OpenCV 4.5 REQUIRED)  # Finds OpenCV on your system
target_link_libraries(${PROJECT_NAME} PUBLIC ${OpenCV_LIBS})  # Links OpenCV
```

**How to use it:**

1. Open PowerShell in `mobile-app/cpp/`
2. Run: `cmake -B build`
3. Run: `cmake --build build`

---

## 🔌 **How C++ Connects to React Native**

### **The Bridge Architecture:**

```
React Native (JavaScript)
         ↓
    NativeModules
         ↓
BioVaultModule.java (Android JNI)
         ↓
bio_vault_native.cpp (C++ Implementation)
         ↓
rppg_engine.cpp, prnu_extractor.cpp, etc.
```

### **Files Involved:**

1. **App.js** (JavaScript):
   ```javascript
   import { NativeModules } from 'react-native';
   const { BioVaultModule } = NativeModules;
   
   // Call C++ function
   const result = await BioVaultModule.init();
   ```

2. **BioVaultModule.java** (Java/JNI):
   ```java
   private native String initialize();  // Links to C++
   
   @ReactMethod
   public void init(Promise promise) {
       String result = initialize();  // Calls C++ function
       promise.resolve(result);
   }
   ```

3. **bio_vault_native.cpp** (C++):
   ```cpp
   JNIEXPORT jstring JNICALL
   Java_com_biovault_BioVaultModule_initialize(JNIEnv* env, jobject thiz) {
       // C++ implementation
       return env->NewStringUTF("Initialized");
   }
   ```

---

## 📱 **hardhat.config.js Explanation**

Located at: `smart-contracts/hardhat.config.js`

**What it does:**
- Configures blockchain networks (local, testnet, mainnet)
- Sets up contract compilation settings
- Configures gas reporting and verification

**Key sections:**

```javascript
networks: {
    mumbai: {
        url: POLYGON_RPC_URL,      // From your .env file
        accounts: [PRIVATE_KEY],   // Your wallet private key
        chainId: 80001             // Mumbai testnet
    }
}
```

**How to deploy:**

```powershell
# Deploy to Mumbai testnet
npm run deploy:mumbai

# Deploy to local network
npm run deploy:local
```

---

## 🧪 **Testing the System**

### **1. Test Backend API:**

```powershell
# In browser or Postman, visit:
http://localhost:3000/health
```

### **2. Test Smart Contracts:**

```powershell
cd smart-contracts
npm test
```

### **3. Test C++ Engine:**

Create a test file in `mobile-app/cpp/test/`:

```cpp
#include "rppg_engine.h"
int main() {
    biovault::RPPGEngine engine(30, 150);
    // Test code here
}
```

---

## 🐛 **Common Issues & Solutions**

### **"OpenCV not found"**
- Verify `OpenCV_DIR` environment variable
- Restart PowerShell after setting environment variables
- Use full path: `cmake .. -DOpenCV_DIR=C:/opencv/build`

### **"Cannot find module 'ethers'"**
- Run: `npm run install:all`
- Check that you're in the correct directory

### **"Port 3000 already in use"**
- Change PORT in backend/.env
- Or kill the process: `netstat -ano | findstr :3000`

### **"React Native bundler error"**
- Clear cache: `cd mobile-app && npx react-native start --reset-cache`

---

## 📚 **Next Steps**

1. **Read the main README.md** for project overview
2. **Check smart-contracts/README.md** (if created) for contract details
3. **Check zkp-circuits/README.md** for ZK proof setup
4. **Review the code** to understand the architecture

---

## 💡 **Quick Commands Reference**

```powershell
# Install everything
npm run install:all

# Build C++ core
cd mobile-app\cpp && cmake -B build && cmake --build build

# Compile smart contracts
cd smart-contracts && npm run compile

# Start backend server
cd backend && npm run dev

# Deploy contracts
cd smart-contracts && npm run deploy:mumbai

# Run mobile app
cd mobile-app && npm run android
```

---

## 🎯 **Project Status**

✅ Complete monorepo structure created
✅ C++ biometric engine with OpenCV
✅ React Native mobile app foundation
✅ Smart contracts with full test suite
✅ ZK-proof circuits
✅ Backend API server with Web3 & IPFS
✅ Shared utilities module

**Ready to build!** 🚀
