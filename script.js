// WhatsApp Clone JavaScript
class ChatApp {
    constructor() {
        this.socket = null;
        this.currentUser = null;
        this.selectedContact = null;
        this.users = [];
        this.messages = {};

        this.initializeElements();
        this.attachEventListeners();
        this.checkAuthStatus();
    }

    initializeElements() {
        // Auth elements
        this.authModal = document.getElementById('authModal');
        this.loginForm = document.getElementById('loginForm');
        this.registerForm = document.getElementById('registerForm');
        this.authMessage = document.getElementById('authMessage');

        // Chat elements
        this.chatApp = document.getElementById('chatApp');
        this.contactsScreen = document.getElementById('contactsScreen');
        this.chatScreen = document.getElementById('chatScreen');
        this.currentUsername = document.getElementById('currentUsername');
        this.contactsList = document.getElementById('contactsList');
        this.chatHeader = document.getElementById('chatHeader');
        this.messagesArea = document.getElementById('messagesArea');
        this.messageInput = document.getElementById('messageInput');

        // Input elements
        this.messageText = document.getElementById('messageText');
        this.chatUsername = document.getElementById('chatUsername');
        this.chatStatus = document.getElementById('chatStatus');
    }

    attachEventListeners() {
        // Auth form toggles
        document.getElementById('showRegister').addEventListener('click', () => this.showRegisterForm());
        document.getElementById('showLogin').addEventListener('click', () => this.showLoginForm());

        // Auth buttons
        document.getElementById('loginBtn').addEventListener('click', () => this.login());
        document.getElementById('registerBtn').addEventListener('click', () => this.register());
        document.getElementById('logoutBtn').addEventListener('click', () => this.logout());

        // Navigation
        document.getElementById('backToContacts').addEventListener('click', () => this.showContactsScreen());

        // Message sending
        document.getElementById('sendBtn').addEventListener('click', () => this.sendMessage());
        this.messageText.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });

        // Auto-resize textarea
        this.messageText.addEventListener('input', () => {
            this.messageText.style.height = 'auto';
            this.messageText.style.height = Math.min(this.messageText.scrollHeight, 120) + 'px';
        });

        // Search functionality
        document.getElementById('searchContacts').addEventListener('input', (e) => this.searchContacts(e.target.value));

        // Add contact functionality
        document.getElementById('addContactBtn').addEventListener('click', () => this.showAddContactModal());
        document.getElementById('closeAddContactModal').addEventListener('click', () => this.hideAddContactModal());
        document.getElementById('addContactConfirm').addEventListener('click', () => this.addContact());

        // Image upload
        document.getElementById('imageBtn').addEventListener('click', () => {
            document.getElementById('imageInput').click();
        });
        document.getElementById('imageInput').addEventListener('change', (e) => this.handleImageUpload(e));

        // Audio upload
        document.getElementById('audioBtn').addEventListener('click', () => {
            document.getElementById('audioInput').click();
        });
        document.getElementById('audioInput').addEventListener('change', (e) => this.handleAudioUpload(e));

        // Voice recording
        this.mediaRecorder = null;
        this.audioChunks = [];
        this.isRecording = false;

        // Video upload
        document.getElementById('videoBtn').addEventListener('click', () => {
            document.getElementById('videoInput').click();
        });
        document.getElementById('videoInput').addEventListener('change', (e) => this.handleVideoUpload(e));

        // Call functionality
        document.getElementById('videoCallBtn').addEventListener('click', () => this.startCall('video'));
        document.getElementById('voiceCallBtn').addEventListener('click', () => this.startCall('voice'));
        document.getElementById('endCall').addEventListener('click', () => this.endCall());

        // Avatar upload
        document.getElementById('avatarInput').addEventListener('change', (e) => this.handleAvatarUpload(e));
    }

    checkAuthStatus() {
        const token = localStorage.getItem('authToken');
        const user = localStorage.getItem('currentUser');

        if (token && user) {
            this.currentUser = JSON.parse(user);
            this.showChatInterface();
            this.initializeSocket();
        }
    }

    showRegisterForm() {
        this.loginForm.classList.add('d-none');
        this.registerForm.classList.remove('d-none');
        this.clearAuthMessage();
    }

    showLoginForm() {
        this.registerForm.classList.add('d-none');
        this.loginForm.classList.remove('d-none');
        this.clearAuthMessage();
    }

    async login() {
        const phone = document.getElementById('loginPhone').value;
        const password = document.getElementById('loginPassword').value;

        if (!phone || !password) {
            this.showAuthMessage('يرجى ملء جميع الحقول', 'error');
            return;
        }

        if (phone.length !== 9) {
            this.showAuthMessage('رقم الهاتف يجب أن يكون 9 أرقام', 'error');
            return;
        }

        try {
            this.showLoadingInAuth('تسجيل الدخول...');

            const response = await fetch('/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phone: `+212${phone}`, password })
            });

            const data = await response.json();

            if (response.ok) {
                localStorage.setItem('authToken', data.token);
                localStorage.setItem('currentUser', JSON.stringify(data.user));
                this.currentUser = data.user;

                this.showChatInterface();
                this.initializeSocket();
                this.showAuthMessage('تم تسجيل الدخول بنجاح!', 'success');
            } else {
                this.showAuthMessage(data.error, 'error');
            }
        } catch (error) {
            this.showAuthMessage('خطأ في الاتصال بالخادم', 'error');
        }
    }

    async register() {
        const username = document.getElementById('registerUsername').value;
        const phone = document.getElementById('registerPhone').value;
        const password = document.getElementById('registerPassword').value;

        if (!username || !phone || !password) {
            this.showAuthMessage('يرجى ملء جميع الحقول', 'error');
            return;
        }

        if (phone.length !== 9) {
            this.showAuthMessage('رقم الهاتف يجب أن يكون 9 أرقام', 'error');
            return;
        }

        if (password.length < 6) {
            this.showAuthMessage('كلمة المرور يجب أن تكون 6 أحرف على الأقل', 'error');
            return;
        }

        try {
            this.showLoadingInAuth('إنشاء الحساب...');

            const response = await fetch('/api/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, phone: `+212${phone}`, password })
            });

            const data = await response.json();

            if (response.ok) {
                localStorage.setItem('authToken', data.token);
                localStorage.setItem('currentUser', JSON.stringify(data.user));
                this.currentUser = data.user;

                this.showChatInterface();
                this.initializeSocket();
                this.showAuthMessage('تم إنشاء الحساب بنجاح!', 'success');
            } else {
                this.showAuthMessage(data.error, 'error');
            }
        } catch (error) {
            this.showAuthMessage('خطأ في الاتصال بالخادم', 'error');
        }
    }

    logout() {
        localStorage.removeItem('authToken');
        localStorage.removeItem('currentUser');

        if (this.socket) {
            this.socket.disconnect();
        }

        this.authModal.classList.remove('d-none');
        this.chatApp.classList.add('d-none');
        this.currentUser = null;
        this.selectedContact = null;

        this.showLoginForm();
        this.clearAuthMessage();
    }

    showChatInterface() {
        this.authModal.classList.add('d-none');
        this.chatApp.classList.remove('d-none');
        this.currentUsername.textContent = this.currentUser.username;
        this.updateUserAvatar();
        this.loadContacts();
        this.showContactsScreen();
    }

    showContactsScreen() {
        this.contactsScreen.classList.add('active');
        this.chatScreen.classList.remove('active');
        this.selectedContact = null;
    }

    showChatScreen() {
        this.contactsScreen.classList.remove('active');
        this.chatScreen.classList.add('active');
    }

    initializeSocket() {
        this.socket = io();

        this.socket.emit('user_connected', this.currentUser.id);

        this.socket.on('receive_message', (message) => {
            this.handleReceivedMessage(message);
        });

        this.socket.on('message_sent', (message) => {
            this.handleMessageSent(message);
        });

        this.socket.on('user_online', (userId) => {
            this.updateUserStatus(userId, true);
        });

        this.socket.on('user_offline', (userId) => {
            this.updateUserStatus(userId, false);
        });

        this.socket.on('message_error', (error) => {
            this.showNotification('فشل في إرسال الرسالة', 'error');
        });

        this.socket.on('contacts_updated', () => {
            this.loadContacts();
        });

        this.socket.on('incoming_call', (data) => {
            this.handleIncomingCall(data);
        });

        this.socket.on('call_ended', () => {
            this.hideCallModal();
        });

        this.socket.on('call_accepted', (data) => {
            this.handleCallAccepted(data);
        });

        this.socket.on('call_rejected', () => {
            this.hideCallModal();
            this.showNotification('تم رفض الاتصال', 'error');
        });
    }

    async loadContacts() {
        try {
            const response = await fetch(`/api/users?userId=${this.currentUser.id}`);
            const users = await response.json();

            this.users = users;
            this.renderContacts();
        } catch (error) {
            console.error('Error loading contacts:', error);
        }
    }

    renderContacts() {
        this.contactsList.innerHTML = '';

        this.users.forEach(user => {
            const contactElement = document.createElement('div');
            contactElement.className = 'contact-item';
            contactElement.dataset.userId = user._id;

            const avatarContent = user.avatar ? 
                `<img src="${user.avatar}" alt="صورة شخصية" style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover;">` :
                `<i class="fas fa-user"></i>`;

            contactElement.innerHTML = `
                <div class="contact-avatar">
                    ${avatarContent}
                </div>
                <div class="contact-info">
                    <div class="contact-name">${user.username}</div>
                    <div class="contact-status ${user.isOnline ? 'online' : ''}">
                        ${user.isOnline ? 'متصل' : 'غير متصل'}
                    </div>
                </div>
            `;

            contactElement.addEventListener('click', () => this.selectContact(user));
            this.contactsList.appendChild(contactElement);
        });
    }

    async selectContact(user) {
        this.selectedContact = user;

        // Update chat header
        this.chatUsername.textContent = user.username;
        this.chatStatus.textContent = user.isOnline ? 'متصل' : 'آخر ظهور منذ قليل';
        
        // Update chat header avatar
        const chatAvatar = document.querySelector('#chatHeader .user-avatar');
        if (user.avatar) {
            chatAvatar.innerHTML = `<img src="${user.avatar}" alt="صورة شخصية" style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover;">`;
        } else {
            chatAvatar.innerHTML = `<i class="fas fa-user"></i>`;
        }

        // Show chat screen
        this.showChatScreen();

        // Load messages
        await this.loadMessages(user._id);

        // Scroll to bottom
        setTimeout(() => this.scrollToBottom(), 100);
    }

    async loadMessages(userId) {
        try {
            const response = await fetch(`/api/messages/${userId}?currentUserId=${this.currentUser.id}`);
            const messages = await response.json();

            this.messages[userId] = messages;
            this.renderMessages(userId);
        } catch (error) {
            console.error('Error loading messages:', error);
        }
    }

    renderMessages(userId) {
        if (!this.messages[userId]) return;

        this.messagesArea.innerHTML = '';

        this.messages[userId].forEach(message => {
            this.displayMessage(message);
        });

        this.scrollToBottom();
    }

    displayMessage(message) {
        const messageElement = document.createElement('div');
        const isSent = message.sender._id === this.currentUser.id;

        messageElement.className = `message ${isSent ? 'message-sent' : 'message-received'}`;

        const time = new Date(message.timestamp).toLocaleTimeString('ar-SA', {
            hour: '2-digit',
            minute: '2-digit'
        });

        let contentHtml = '';
        if (message.type === 'image' && message.imageUrl) {
            contentHtml = `
                <div class="message-image">
                    <img src="${message.imageUrl}" alt="صورة" style="max-width: 200px; max-height: 200px; border-radius: 10px; cursor: pointer;" onclick="window.open('${message.imageUrl}', '_blank')">
                </div>
            `;
        } else if (message.type === 'audio' && message.audioUrl) {
            contentHtml = `
                <div class="message-audio">
                    <audio controls style="width: 250px;">
                        <source src="${message.audioUrl}" type="audio/mpeg">
                        المتصفح لا يدعم الصوت
                    </audio>
                </div>
            `;
        } else if (message.type === 'video' && message.videoUrl) {
            contentHtml = `
                <div class="message-video">
                    <video controls style="max-width: 250px; max-height: 200px; border-radius: 10px;">
                        <source src="${message.videoUrl}" type="video/mp4">
                        المتصفح لا يدعم الفيديو
                    </video>
                </div>
            `;
        } else {
            contentHtml = `<div class="message-content">${message.content}</div>`;
        }

        messageElement.innerHTML = `
            ${contentHtml}
            <div class="message-time">${time}</div>
        `;

        this.messagesArea.appendChild(messageElement);
    }

    sendMessage() {
        const content = this.messageText.value.trim();

        if (!content || !this.selectedContact) return;

        this.socket.emit('send_message', {
            senderId: this.currentUser.id,
            receiverId: this.selectedContact._id,
            content
        });

        this.messageText.value = '';
        this.messageText.style.height = 'auto';
    }

    handleReceivedMessage(message) {
        const senderId = message.sender._id;

        if (!this.messages[senderId]) {
            this.messages[senderId] = [];
        }

        this.messages[senderId].push(message);

        // Check if sender is in contacts list
        const senderInContacts = this.users.find(u => u._id === senderId);
        
        // If sender is not in contacts, refresh the contacts list
        if (!senderInContacts) {
            this.loadContacts();
        }

        // If this is the current chat, display the message
        if (this.selectedContact && this.selectedContact._id === senderId) {
            this.displayMessage(message);
            this.scrollToBottom();
        } else {
            // Show notification based on message type
            let notificationText = `رسالة جديدة من ${message.sender.username}`;
            if (message.type === 'image') {
                notificationText = `صورة جديدة من ${message.sender.username}`;
            } else if (message.type === 'audio') {
                notificationText = `رسالة صوتية من ${message.sender.username}`;
            } else if (message.type === 'video') {
                notificationText = `فيديو جديد من ${message.sender.username}`;
            }
            
            this.showNotification(notificationText, 'success');
            this.updateContactWithNewMessage(senderId);
        }
    }

    handleMessageSent(message) {
        // Only add to messages if this is a text message
        // Media messages are handled by their respective upload functions
        if (!message.type || message.type === 'text') {
            const receiverId = this.selectedContact._id;

            if (!this.messages[receiverId]) {
                this.messages[receiverId] = [];
            }

            this.messages[receiverId].push(message);
            this.displayMessage(message);
            this.scrollToBottom();
        }
    }

    updateUserStatus(userId, isOnline) {
        const userElement = document.querySelector(`[data-user-id="${userId}"] .contact-status`);
        if (userElement) {
            userElement.textContent = isOnline ? 'متصل' : 'غير متصل';
            userElement.className = `contact-status ${isOnline ? 'online' : ''}`;
        }

        // Update selected contact status
        if (this.selectedContact && this.selectedContact._id === userId) {
            this.chatStatus.textContent = isOnline ? 'متصل' : 'آخر ظهور منذ قليل';
        }
    }

    updateContactWithNewMessage(userId) {
        const contactElement = document.querySelector(`[data-user-id="${userId}"]`);
        if (contactElement && (!this.selectedContact || this.selectedContact._id !== userId)) {
            if (!contactElement.querySelector('.new-message-indicator')) {
                const indicator = document.createElement('div');
                indicator.className = 'new-message-indicator';
                contactElement.appendChild(indicator);
            }
        }
    }

    searchContacts(query) {
        const filteredUsers = this.users.filter(user =>
            user.username.toLowerCase().includes(query.toLowerCase())
        );

        this.contactsList.innerHTML = '';

        filteredUsers.forEach(user => {
            const contactElement = document.createElement('div');
            contactElement.className = 'contact-item';
            contactElement.dataset.userId = user._id;

            contactElement.innerHTML = `
                <div class="contact-avatar">
                    <i class="fas fa-user"></i>
                </div>
                <div class="contact-info">
                    <div class="contact-name">${user.username}</div>
                    <div class="contact-status ${user.isOnline ? 'online' : ''}">
                        ${user.isOnline ? 'متصل' : 'غير متصل'}
                    </div>
                </div>
            `;

            contactElement.addEventListener('cli