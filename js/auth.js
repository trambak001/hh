import { auth, RecaptchaVerifier, signInWithPhoneNumber, onAuthStateChanged, signOut, updateProfile } from './firebase-config.js';

class AuthManager {
    constructor(onAuthSuccess) {
        this.onAuthSuccess = onAuthSuccess;
        this.currentUser = null;
        this.confirmationResult = null;
        this.recaptchaVerifier = null;

        // UI Elements
        this.authOverlay = document.getElementById('authOverlay');
        this.phoneInputStep = document.getElementById('phoneInputStep');
        this.otpInputStep = document.getElementById('otpInputStep');

        this.phoneNumberInput = document.getElementById('phoneNumberInput');
        this.otpCodeInput = document.getElementById('otpCodeInput');

        this.sendOtpBtn = document.getElementById('sendOtpBtn');
        this.verifyOtpBtn = document.getElementById('verifyOtpBtn');
        this.backToPhoneBtn = document.getElementById('backToPhoneBtn');

        this.errorMsg = document.getElementById('authErrorMsg');
        this.successMsg = document.getElementById('authSuccessMsg');

        this._setupListeners();
        this._initAuthObserver();
    }

    _setupListeners() {
        this.sendOtpBtn.addEventListener('click', () => this.sendOtp());
        this.verifyOtpBtn.addEventListener('click', () => this.verifyOtp());
        this.backToPhoneBtn.addEventListener('click', () => this._showPhoneStep());
    }

    _initAuthObserver() {
        onAuthStateChanged(auth, (user) => {
            if (user) {
                this.currentUser = user;
                this.authOverlay.classList.add('hidden');
                console.log('User signed in:', user.phoneNumber);
                if (this.onAuthSuccess) this.onAuthSuccess(user);
            } else {
                this.currentUser = null;
                this.authOverlay.classList.remove('hidden');
                this._showPhoneStep();
            }
        });
    }

    _showError(msg) {
        this.errorMsg.textContent = msg;
        this.errorMsg.classList.remove('hidden');
        this.successMsg.classList.add('hidden');
    }

    _showSuccess(msg) {
        this.successMsg.textContent = msg;
        this.successMsg.classList.remove('hidden');
        this.errorMsg.classList.add('hidden');
    }

    _clearMessages() {
        this.errorMsg.classList.add('hidden');
        this.successMsg.classList.add('hidden');
    }

    _showPhoneStep() {
        this.phoneInputStep.classList.remove('hidden');
        this.otpInputStep.classList.add('hidden');
        this.otpCodeInput.value = '';
        this._clearMessages();
    }

    _showOtpStep() {
        this.phoneInputStep.classList.add('hidden');
        this.otpInputStep.classList.remove('hidden');
        this._clearMessages();
    }

    _initRecaptcha() {
        if (!this.recaptchaVerifier) {
            this.recaptchaVerifier = new RecaptchaVerifier(auth, 'recaptcha-container', {
                'size': 'normal',
                'callback': (response) => {
                    // reCAPTCHA solved
                },
                'expired-callback': () => {
                    this._showError('reCAPTCHA expired. Please verify again.');
                }
            });
        }
    }

    async sendOtp() {
        this._clearMessages();
        const phoneNumber = this.phoneNumberInput.value.trim();

        if (!phoneNumber) {
            this._showError('Please enter a valid phone number.');
            return;
        }

        // Extremely basic validation to ensure it has a + sign for international format
        if (!phoneNumber.startsWith('+')) {
            this._showError('Please include your country code (e.g., +1)');
            return;
        }

        this.sendOtpBtn.disabled = true;
        this.sendOtpBtn.textContent = 'Sending...';

        try {
            this._initRecaptcha();
            this.confirmationResult = await signInWithPhoneNumber(auth, phoneNumber, this.recaptchaVerifier);
            this._showOtpStep();
            this.sendOtpBtn.disabled = false;
            this.sendOtpBtn.textContent = 'Send OTP';
        } catch (error) {
            console.error('Error during signInWithPhoneNumber', error);
            this._showError(error.message || 'Failed to send OTP. Please try again.');
            this.sendOtpBtn.disabled = false;
            this.sendOtpBtn.textContent = 'Send OTP';

            // Reset reCAPTCHA on error
            if (this.recaptchaVerifier) {
                this.recaptchaVerifier.render().then((widgetId) => {
                    grecaptcha.reset(widgetId);
                });
            }
        }
    }

    async verifyOtp() {
        this._clearMessages();
        const code = this.otpCodeInput.value.trim();

        if (!code || code.length !== 6) {
            this._showError('Please enter the 6-digit OTP.');
            return;
        }

        if (!this.confirmationResult) {
            this._showError('Session expired. Please request a new OTP.');
            this._showPhoneStep();
            return;
        }

        this.verifyOtpBtn.disabled = true;
        this.verifyOtpBtn.textContent = 'Verifying...';

        try {
            const result = await this.confirmationResult.confirm(code);
            this.currentUser = result.user;

            // Generate a default display name if none exists
            if (!this.currentUser.displayName) {
                const randomName = "Player_" + Math.floor(Math.random() * 10000);
                await updateProfile(this.currentUser, {
                    displayName: randomName
                });
            }

            this._showSuccess('Success! Logging in...');

            // The AuthObserver will detect the login instantly and hide the modal
        } catch (error) {
            console.error('Error verifying OTP', error);
            this._showError('Invalid code. Please check and try again.');
            this.verifyOtpBtn.disabled = false;
            this.verifyOtpBtn.textContent = 'Verify & Login';
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
