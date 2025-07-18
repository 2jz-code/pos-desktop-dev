#!/usr/bin/env node

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('🚀 Starting production build for Ajeen POS...');

// Step 1: Clean previous builds
console.log('🧹 Cleaning previous builds...');
try {
    if (fs.existsSync('dist')) {
        fs.rmSync('dist', { recursive: true, force: true });
    }
    if (fs.existsSync('dist-electron')) {
        fs.rmSync('dist-electron', { recursive: true, force: true });
    }
    if (fs.existsSync('dist-app')) {
        fs.rmSync('dist-app', { recursive: true, force: true });
    }
    console.log('✅ Clean completed');
} catch (error) {
    console.error('❌ Clean failed:', error.message);
    process.exit(1);
}

// Step 2: Copy production config
console.log('📋 Setting up production configuration...');
try {
    const prodConfig = path.join(__dirname, 'config.env.production');
    const targetConfig = path.join(__dirname, '.env');
    
    if (fs.existsSync(prodConfig)) {
        fs.copyFileSync(prodConfig, targetConfig);
        console.log('✅ Production config copied');
    } else {
        console.warn('⚠️  Production config not found, using default settings');
    }
} catch (error) {
    console.error('❌ Config setup failed:', error.message);
    process.exit(1);
}

// Step 3: Install dependencies
console.log('📦 Installing dependencies...');
try {
    execSync('npm ci', { stdio: 'inherit' });
    console.log('✅ Dependencies installed');
} catch (error) {
    console.error('❌ Dependency installation failed:', error.message);
    process.exit(1);
}

// Step 4: Build the application
console.log('🔨 Building application...');
try {
    execSync('npm run build:prod', { stdio: 'inherit' });
    console.log('✅ Build completed successfully');
} catch (error) {
    console.error('❌ Build failed:', error.message);
    process.exit(1);
}

// Step 5: Verify build output
console.log('🔍 Verifying build output...');
const requiredFiles = [
    'dist/index.html',
    'dist/customer.html',
    'dist-electron/main.js',
    'dist-electron/preload.js'
];

let allFilesExist = true;
for (const file of requiredFiles) {
    if (!fs.existsSync(file)) {
        console.error(`❌ Required file missing: ${file}`);
        allFilesExist = false;
    }
}

if (allFilesExist) {
    console.log('✅ All required files present');
    console.log('🎉 Production build completed successfully!');
    console.log('📁 Distribution files are in: dist-app/');
} else {
    console.error('❌ Build verification failed');
    process.exit(1);
}