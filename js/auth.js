import { auth, googleProvider, signInWithPopup, onAuthStateChanged, signOut, updateProfile } from './firebase-config.js';

class AuthManager {
    constructor(onAuthSuccess) {
        this.onAuthSuccess = onAuthSuccess;
        this.currentUser = null;

        // UI Elements
        this.authOverlay = document.getElementById('authOverlay');
        this.googleSignInBtn = document.getElementById('googleSignInBtn');

        this.errorMsg = document.getElementById('authErrorMsg');
        this.successMsg = document.getElementById('authSuccessMsg');

        this._setupListeners();
        this._initAuthObserver();
    }

    _setupListeners() {
        if (this.googleSignInBtn) {
            this.googleSignInBtn.addEventListener('click', () => this.signInWithGoogle());
        }
    }

    _initAuthObserver() {
        onAuthStateChanged(auth, (user) => {
            if (user) {
                this.currentUser = user;
                this.authOverlay.classList.add('hidden');
                console.log('User signed in:', user.email || user.uid);
                if (this.onAuthSuccess) this.onAuthSuccess(user);
            } else {
                this.currentUser = null;
                this.authOverlay.classList.remove('hidden');
            }
        });
    }

    _showError(msg) {
        if (this.errorMsg) {
            this.errorMsg.textContent = msg;
            this.errorMsg.classList.remove('hidden');
        }
        if (this.successMsg) this.successMsg.classList.add('hidden');
    }

    _showSuccess(msg) {
        if (this.successMsg) {
            this.successMsg.textContent = msg;
            this.successMsg.classList.remove('hidden');
        }
        if (this.errorMsg) this.errorMsg.classList.add('hidden');
    }

    _clearMessages() {
        if (this.errorMsg) this.errorMsg.classList.add('hidden');
        if (this.successMsg) this.successMsg.classList.add('hidden');
    }

    async signInWithGoogle() {
        this._clearMessages();
        this.googleSignInBtn.disabled = true;

        try {
            const result = await signInWithPopup(auth, googleProvider);
            this.currentUser = result.user;
            this._showSuccess('Success! Logging in...');
        } catch (error) {
            console.error('Error during Google Sign-In', error);
            this._showError(error.message || 'Failed to sign in with Google. Please try again.');
        } finally {
            this.googleSignInBtn.disabled = false;
        }
    }

    async logout() {
        try {
            await signOut(auth);
            console.log('User signed out.');
        } catch (error) {
            console.error('Error signing out', error);
        }
    }
}

export { AuthManager };
