import { db, auth, updateProfile, ref, set, update, get, onValue, onChildAdded, remove } from './firebase-config.js';
// To use onDisconnect we need to import it separately
import { onDisconnect } from 'https://www.gstatic.com/firebasejs/11.4.0/firebase-database.js';

class SocialManager {
    constructor(currentUser) {
        this.user = currentUser;
        this.uid = this.user.phoneNumber.replace('+', ''); // Use phone number digits as safe ID
        this.friends = {};

        // UI Elements
        this.sidebar = document.getElementById('socialSidebar');
        this.toggleBtn = document.getElementById('toggleSocialBtn');
        this.closeBtn = document.getElementById('closeSocialBtn');

        this.userNameEl = document.getElementById('userProfileName');
        this.userPhoneEl = document.getElementById('userPhoneNumber');
        this.userPresenceDot = document.getElementById('userPresenceDot');

        this.addFriendInput = document.getElementById('addFriendInput');
        this.sendRequestBtn = document.getElementById('sendFriendRequestBtn');

        this.requestsSection = document.getElementById('friendRequestsSection');
        this.requestsList = document.getElementById('friendRequestsList');
        this.pendingBadge = document.getElementById('pendingRequestBadge');

        this.friendsList = document.getElementById('friendsList');
        this.noFriendsMsg = document.getElementById('noFriendsMsg');

        // Profile Modal
        this.editProfileBtn = document.getElementById('editProfileBtn');
        this.editProfileOverlay = document.getElementById('editProfileOverlay');
        this.closeProfileBtn = document.getElementById('closeProfileBtn');
        this.saveProfileBtn = document.getElementById('saveProfileBtn');

        this.profileAvatarInput = document.getElementById('profileAvatarInput');
        this.profileNameInput = document.getElementById('profileNameInput');
        this.profileLocInput = document.getElementById('profileLocInput');
        this.profileBioInput = document.getElementById('profileBioInput');

        this.userAvatarEl = document.getElementById('userAvatarEmoji');

        this._setupListeners();
        this._initProfile();
        this._setupPresence();
        this._listenForRequests();
        this._listenForFriends();
    }

    _setupListeners() {
        this.toggleBtn.addEventListener('click', () => {
            this.sidebar.classList.toggle('hidden');
        });

        this.closeBtn.addEventListener('click', () => {
            this.sidebar.classList.add('hidden');
        });

        this.sendRequestBtn.addEventListener('click', () => {
            this.sendFriendRequest();
        });

        // Profile Modal Listeners
        this.editProfileBtn.addEventListener('click', () => this._openProfileModal());
        this.closeProfileBtn.addEventListener('click', () => this.editProfileOverlay.classList.add('hidden'));
        this.saveProfileBtn.addEventListener('click', () => this._saveProfile());

        // Logout handled in App/Auth
    }

    // ==========================================
    // Profile Management
    // ==========================================
    async _initProfile() {
        this.userNameEl.textContent = this.user.displayName || "Player";
        this.userPhoneEl.textContent = this.user.phoneNumber;

        const userRef = ref(db, `users/${this.uid}`);

        // Listen to own profile changes to update Sidebar UI instantly
        onValue(userRef, (snap) => {
            if (snap.exists()) {
                const data = snap.val();
                if (data.displayName) this.userNameEl.textContent = data.displayName;
                if (data.avatarUrl) this.userAvatarEl.textContent = data.avatarUrl;
                this.userProfileData = data; // Cache
            }
        });

        // Ensure user node exists with defaults
        await update(userRef, {
            displayName: this.user.displayName || "Player",
            phoneNumber: this.user.phoneNumber,
            lastLogin: Date.now()
        });
    }

    _openProfileModal() {
        if (this.userProfileData) {
            this.profileAvatarInput.value = this.userProfileData.avatarUrl || '👤';
            this.profileNameInput.value = this.userProfileData.displayName || '';
            this.profileLocInput.value = this.userProfileData.location || '';
            this.profileBioInput.value = this.userProfileData.bio || '';
        }
        this.editProfileOverlay.classList.remove('hidden');
    }

    async _saveProfile() {
        const newName = this.profileNameInput.value.trim();
        const newAvatar = this.profileAvatarInput.value.trim() || '👤';
        const newLoc = this.profileLocInput.value.trim();
        const newBio = this.profileBioInput.value.trim();

        if (!newName) {
            alert('Display Name cannot be empty!');
            return;
        }

        this.saveProfileBtn.disabled = true;
        this.saveProfileBtn.textContent = 'Saving...';

        try {
            // Update Firebase Auth profile
            await updateProfile(auth.currentUser, { displayName: newName });
            this.user.displayName = newName;

            // Update Database Profile
            await update(ref(db, `users/${this.uid}`), {
                displayName: newName,
                avatarUrl: newAvatar, // We're using emoji as the avatar
                location: newLoc,
                bio: newBio
            });

            this.editProfileOverlay.classList.add('hidden');
        } catch (error) {
            console.error('Error saving profile:', error);
            alert('Failed to save profile details.');
        } finally {
            this.saveProfileBtn.disabled = false;
            this.saveProfileBtn.textContent = 'Save Profile';
        }
    }

    _setupPresence() {
        const myConnectionsRef = ref(db, `users/${this.uid}/connections`);
        const lastOnlineRef = ref(db, `users/${this.uid}/lastOnline`);

        const connectedRef = ref(db, '.info/connected');
        onValue(connectedRef, (snap) => {
            if (snap.val() === true) {
                // We're connected
                const con = onDisconnect(myConnectionsRef);
                con.set(false);
                onDisconnect(lastOnlineRef).set(Date.now());

                // Set online status
                update(ref(db, `users/${this.uid}`), {
                    connections: true,
                    lastOnline: Date.now()
                });
                this.userPresenceDot.className = 'presence-dot online';
            } else {
                this.userPresenceDot.className = 'presence-dot offline';
            }
        });
    }

    async sendFriendRequest() {
        // Simple search by formatting the input phone number
        let targetPhone = this.addFriendInput.value.trim();
        if (!targetPhone) return;
        if (!targetPhone.startsWith('+')) targetPhone = '+' + targetPhone;

        this.sendRequestBtn.disabled = true;
        this.sendRequestBtn.textContent = '...';

        try {
            // Because our DB is just keyed by numbers, construct target ID
            const targetId = targetPhone.replace('+', '');

            if (targetId === this.uid) {
                alert("You cannot add yourself.");
                return;
            }

            // Check if user exists
            const userSnap = await get(ref(db, `users/${targetId}`));
            if (!userSnap.exists()) {
                alert("User not found!");
                return;
            }

            // Write request
            await set(ref(db, `users/${targetId}/requests/${this.uid}`), {
                from: this.uid,
                name: this.user.displayName || "Player",
                timestamp: Date.now()
            });

            this.addFriendInput.value = '';
            alert("Friend request sent!");
        } catch (e) {
            console.error("Error sending request:", e);
            alert("Failed to send request.");
        } finally {
            this.sendRequestBtn.disabled = false;
            this.sendRequestBtn.textContent = 'Add';
        }
    }

    _listenForRequests() {
        const reqRef = ref(db, `users/${this.uid}/requests`);

        onValue(reqRef, (snapshot) => {
            this.requestsList.innerHTML = '';
            let count = 0;

            if (snapshot.exists()) {
                snapshot.forEach(child => {
                    const req = child.val();
                    const reqId = child.key;
                    count++;
                    this._renderRequest(reqId, req);
                });
            }

            if (count > 0) {
                this.requestsSection.classList.remove('hidden');
                this.pendingBadge.textContent = count;
                this.pendingBadge.classList.remove('hidden');
            } else {
                this.requestsSection.classList.add('hidden');
                this.pendingBadge.classList.add('hidden');
            }
        });
    }

    _renderRequest(reqId, reqData) {
        const div = document.createElement('div');
        div.className = 'request-item';
        div.innerHTML = `
            <div class="friend-info">
                <div class="friend-avatar">👤</div>
                <div class="friend-name">${reqData.name || 'Unknown'}</div>
            </div>
            <div class="friend-actions">
                <button class="action-btn accept" title="Accept">✓</button>
                <button class="action-btn deny" title="Deny">✗</button>
            </div>
        `;

        div.querySelector('.accept').addEventListener('click', () => this.acceptRequest(reqId, reqData));
        div.querySelector('.deny').addEventListener('click', () => this.denyRequest(reqId));
        this.requestsList.appendChild(div);
    }

    async acceptRequest(reqId, reqData) {
        // Add to both friends lists
        const updates = {};
        updates[`users/${this.uid}/friends/${reqId}`] = true;
        updates[`users/${reqId}/friends/${this.uid}`] = true;

        // Remove request
        updates[`users/${this.uid}/requests/${reqId}`] = null;

        await update(ref(db), updates);
    }

    async denyRequest(reqId) {
        await remove(ref(db, `users/${this.uid}/requests/${reqId}`));
    }

    _listenForFriends() {
        const friendsRef = ref(db, `users/${this.uid}/friends`);

        onValue(friendsRef, async (snapshot) => {
            this.friendsList.innerHTML = '';
            this.friends = {};
            let count = 0;

            if (snapshot.exists()) {
                this.noFriendsMsg.classList.add('hidden');

                // Fetch profiles for each friend
                for (const friendId in snapshot.val()) {
                    count++;
                    const friendProfileSnap = await get(ref(db, `users/${friendId}`));
                    if (friendProfileSnap.exists()) {
                        const profile = friendProfileSnap.val();
                        this.friends[friendId] = profile;
                        this._renderFriend(friendId, profile);

                        // Listen for presence changes continuously
                        this._listenToFriendPresence(friendId);
                    }
                }
            } else {
                this.noFriendsMsg.classList.remove('hidden');
            }
        });
    }

    _listenToFriendPresence(friendId) {
        const presenceRef = ref(db, `users/${friendId}/connections`);
        onValue(presenceRef, (snap) => {
            const isOnline = snap.val() === true;
            const dot = document.getElementById(`presence-${friendId}`);
            if (dot) {
                dot.className = `presence-dot ${isOnline ? 'online' : 'offline'}`;
            }
        });
    }

    _renderFriend(friendId, profile) {
        // Avoid duplicates if re-rendered
        let div = document.getElementById(`friend-${friendId}`);
        if (!div) {
            div = document.createElement('div');
            div.id = `friend-${friendId}`;
            div.className = 'friend-item';
            this.friendsList.appendChild(div);
        }

        const isOnline = profile.connections === true;

        div.innerHTML = `
            <div class="friend-info">
                <div class="friend-avatar">
                   ${profile.avatarUrl || '👤'}
                   <div id="presence-${friendId}" class="presence-dot ${isOnline ? 'online' : 'offline'}"></div>
                </div>
                <div class="friend-name">${profile.displayName || 'Friend'}</div>
            </div>
            <div class="friend-actions">
                <button class="action-btn invite" title="Invite to party" onclick="window.app.inviteFriend('${friendId}')">💬</button>
            </div>
        `;
    }
}

export { SocialManager };
