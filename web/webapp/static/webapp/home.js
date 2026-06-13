// ChatApp frontend controller: direct chat, group chat, voice notes, calls, notifications.

let activeChat = { kind: null, id: null, name: null, pic: null };
let chatSocket = null;
let notifSocket = null;
let notifToastTimeout = null;
let onlineUserIds = new Set();
let mediaRecorder = null;
let voiceChunks = [];
let localCallStream = null;
let peerConnection = null;
let currentCallKind = 'audio';

function storageKey() {
    return 'chatapp-theme';
}

function applySavedTheme() {
    const saved = localStorage.getItem(storageKey()) || 'dark';
    document.body.classList.toggle('light-mode', saved === 'light');
}

function toggleTheme() {
    const isLight = document.body.classList.toggle('light-mode');
    localStorage.setItem(storageKey(), isLight ? 'light' : 'dark');
}

function updateOnlineStatus(userId, status) {
    const dot = document.getElementById('online-dot-' + userId);
    if (dot) dot.classList.toggle('online', status === 'online');

    if (activeChat.kind === 'direct' && userId === activeChat.id) {
        const headerStatus = document.getElementById('chatHeaderStatus');
        headerStatus.textContent = status === 'online' ? 'online' : 'offline';
        headerStatus.style.color = status === 'online' ? '#00a884' : '#8696a0';
    }
}

function setAllOnlineStatuses() {
    document.querySelectorAll('.online-dot').forEach(dot => {
        const uid = parseInt(dot.dataset.userid, 10);
        dot.classList.toggle('online', onlineUserIds.has(uid));
    });
}

function connectNotifications() {
    const wsScheme = window.location.protocol === 'https:' ? 'wss' : 'ws';
    notifSocket = new WebSocket(`${wsScheme}://${window.location.host}/ws/notifications/`);

    notifSocket.onmessage = (e) => {
        const data = JSON.parse(e.data);

        if (data.type === 'online_users') {
            onlineUserIds = new Set(data.users);
            setAllOnlineStatuses();
        }

        if (data.type === 'presence') {
            if (data.status === 'online') onlineUserIds.add(data.user_id);
            else onlineUserIds.delete(data.user_id);
            updateOnlineStatus(data.user_id, data.status);
        }

        if (data.type === 'notification') {
            const msg = data.message;
            const isOpenDirect = activeChat.kind === 'direct' && msg.sender_id === activeChat.id;
            const isOpenGroup = activeChat.kind === 'group' && msg.group_id === activeChat.id;
            if (isOpenDirect || isOpenGroup) return;

            showNotificationToast(msg);
            showBrowserNotification(msg);
            updateSidebarPreview(msg);
        }
    };

    notifSocket.onclose = () => setTimeout(connectNotifications, 3000);
}

function requestNotificationPermission() {
    if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
    }
}

function notificationTitle(msg) {
    return msg.group_name ? `${msg.group_name} - ${msg.sender_username}` : msg.sender_username;
}

function notificationContent(msg) {
    if (msg.message_type === 'voice') return 'Voice note';
    if (msg.message_type === 'call') return msg.content;
    return msg.content;
}

function showBrowserNotification(msg) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    const notif = new Notification(notificationTitle(msg), {
        body: notificationContent(msg),
        icon: msg.sender_pic || undefined,
        tag: msg.group_id ? `group-${msg.group_id}` : `chat-${msg.sender_id}`,
        silent: false,
    });
    notif.onclick = () => {
        window.focus();
        if (msg.group_id) {
            const groupEl = document.getElementById('group-' + msg.group_id);
            if (groupEl) openGroupChat(msg.group_id, groupEl.dataset.name);
        } else {
            const contactEl = document.getElementById('contact-' + msg.sender_id);
            if (contactEl) openChat(msg.sender_id, msg.sender_username, contactEl.dataset.pic || '');
        }
        notif.close();
    };
    setTimeout(() => notif.close(), 5000);
}

function showNotificationToast(msg) {
    const toast = document.getElementById('notifToast');
    const avatarArea = document.getElementById('toastAvatarArea');
    const nameEl = document.getElementById('toastName');
    const msgEl = document.getElementById('toastMsg');
    const title = notificationTitle(msg);

    if (msg.sender_pic) {
        avatarArea.innerHTML = `<img class="toast-avatar" src="${msg.sender_pic}" alt="${escapeAttr(msg.sender_username)}">`;
    } else {
        avatarArea.innerHTML = `<div class="toast-avatar-placeholder">${escapeHtml(msg.sender_username[0].toUpperCase())}</div>`;
    }
    nameEl.textContent = title;
    msgEl.textContent = notificationContent(msg);

    toast.onclick = () => {
        hideNotificationToast();
        if (msg.group_id) {
            const groupEl = document.getElementById('group-' + msg.group_id);
            if (groupEl) openGroupChat(msg.group_id, groupEl.dataset.name);
        } else {
            const contactEl = document.getElementById('contact-' + msg.sender_id);
            if (contactEl) openChat(msg.sender_id, msg.sender_username, contactEl.dataset.pic || '');
        }
    };

    toast.classList.add('show');
    if (notifToastTimeout) clearTimeout(notifToastTimeout);
    notifToastTimeout = setTimeout(hideNotificationToast, 4000);
}

function hideNotificationToast() {
    document.getElementById('notifToast').classList.remove('show');
}

function updateSidebarPreview(msg) {
    const suffix = msg.group_id ? 'group-' + msg.group_id : msg.sender_id;
    const preview = document.getElementById('last-msg-' + suffix);
    const timeEl = document.getElementById('last-time-' + suffix);
    if (preview) preview.textContent = notificationContent(msg);
    if (timeEl) timeEl.textContent = msg.timestamp || '';

    if (!msg.group_id) {
        const badge = document.getElementById('unread-' + msg.sender_id);
        if (badge) {
            const current = parseInt(badge.textContent, 10) || 0;
            badge.textContent = current + 1;
            badge.style.display = 'flex';
        }
    }
}

function clearActiveItems() {
    document.querySelectorAll('.contact-item').forEach(el => el.classList.remove('active'));
}

function showChatShell() {
    document.getElementById('welcomeScreen').style.display = 'none';
    document.getElementById('chatArea').style.display = 'flex';
    document.getElementById('messagesArea').innerHTML = '';
}

function closeExistingSocket() {
    if (chatSocket) {
        chatSocket.onclose = null;
        chatSocket.close();
        chatSocket = null;
    }
}

function openChat(userId, username, picUrl) {
    userId = parseInt(userId, 10);
    activeChat = { kind: 'direct', id: userId, name: username, pic: picUrl };
    clearActiveItems();
    const contactEl = document.getElementById('contact-' + userId);
    if (contactEl) contactEl.classList.add('active');

    const badge = document.getElementById('unread-' + userId);
    if (badge) badge.style.display = 'none';

    showChatShell();
    renderHeader(username, picUrl, onlineUserIds.has(userId) ? 'online' : 'offline', false);
    connectChatSocket(`/ws/chat/${userId}/`, () => activeChat.kind === 'direct' && activeChat.id === userId);
}

function openGroupChat(groupId, groupName) {
    groupId = parseInt(groupId, 10);
    activeChat = { kind: 'group', id: groupId, name: groupName, pic: null };
    clearActiveItems();
    const groupEl = document.getElementById('group-' + groupId);
    if (groupEl) groupEl.classList.add('active');

    showChatShell();
    renderHeader(groupName, '', 'group chat', true);
    connectChatSocket(`/ws/group/${groupId}/`, () => activeChat.kind === 'group' && activeChat.id === groupId);
}

function openContactFromElement(element) {
    openChat(element.dataset.userid, element.dataset.username || 'User', element.dataset.pic || '');
}

function openGroupFromElement(element) {
    openGroupChat(element.dataset.groupid, element.dataset.name || 'Group');
}

function renderHeader(name, picUrl, status, isGroup) {
    const headerAvatar = document.getElementById('chatHeaderAvatar');
    if (isGroup) {
        headerAvatar.innerHTML = `<div class="group-avatar">${escapeHtml(name[0].toUpperCase())}</div>`;
        headerAvatar.classList.remove('profile-trigger');
        headerAvatar.onclick = null;
        document.getElementById('chatHeaderInfo').classList.remove('profile-trigger');
        document.getElementById('chatHeaderInfo').onclick = null;
    } else if (picUrl) {
        headerAvatar.innerHTML = `<img class="contact-avatar" src="${picUrl}" alt="${escapeAttr(name)}">`;
        bindHeaderProfileClick(name, picUrl);
    } else {
        headerAvatar.innerHTML = `<div class="contact-avatar-placeholder">${escapeHtml(name[0].toUpperCase())}</div>`;
        bindHeaderProfileClick(name, '');
    }
    document.getElementById('chatHeaderName').textContent = name;
    const headerStatus = document.getElementById('chatHeaderStatus');
    headerStatus.textContent = status;
    headerStatus.style.color = status === 'online' ? '#00a884' : '#8696a0';
}

function bindHeaderProfileClick(name, picUrl) {
    const headerAvatar = document.getElementById('chatHeaderAvatar');
    const headerInfo = document.getElementById('chatHeaderInfo');
    headerAvatar.classList.add('profile-trigger');
    headerInfo.classList.add('profile-trigger');
    headerAvatar.onclick = () => openContactProfileModal(name, picUrl);
    headerInfo.onclick = () => openContactProfileModal(name, picUrl);
}

function openProfileFromContact(event, element) {
    event.stopPropagation();
    openContactProfileModal(element.dataset.username || 'User', element.dataset.pic || '');
}

function openContactProfileModal(username, picUrl) {
    const modal = document.getElementById('contactProfileModal');
    const photoArea = document.getElementById('contactProfilePhotoArea');
    const title = document.getElementById('contactProfileTitle');
    const name = username || 'User';

    title.textContent = `${name}'s Profile`;
    document.getElementById('contactProfileUsername').textContent = `@${name}`;

    if (picUrl) {
        photoArea.innerHTML = `<img class="profile-view-photo" src="${picUrl}" alt="${escapeAttr(name)}">`;
    } else {
        photoArea.innerHTML = `<div class="profile-view-placeholder">${escapeHtml(name[0].toUpperCase())}</div>`;
    }

    modal.classList.add('open');
}

function closeContactProfileModal() {
    document.getElementById('contactProfileModal').classList.remove('open');
}

function connectChatSocket(path, stillActive) {
    closeExistingSocket();
    const wsScheme = window.location.protocol === 'https:' ? 'wss' : 'ws';
    chatSocket = new WebSocket(`${wsScheme}://${window.location.host}${path}`);
    const connStatus = document.getElementById('connStatus');

    chatSocket.onopen = () => {
        connStatus.classList.remove('disconnected');
    };

    chatSocket.onmessage = (e) => {
        const data = JSON.parse(e.data);
        const area = document.getElementById('messagesArea');

        if (data.type === 'history') {
            area.innerHTML = '';
            data.messages.forEach(msg => appendMessage(msg, msg.sender_id === CURRENT_USER_ID, area));
            area.scrollTop = area.scrollHeight;
            if (data.messages.length) updateActivePreview(data.messages[data.messages.length - 1]);
        }

        if (data.type === 'message') {
            const msg = data.message;
            appendMessage(msg, msg.sender_id === CURRENT_USER_ID, area);
            area.scrollTop = area.scrollHeight;
            updateActivePreview(msg);
        }

        if (data.type === 'call_signal') {
            handleCallSignal(data.signal);
        }
    };

    chatSocket.onclose = () => {
        connStatus.classList.add('disconnected');
        connStatus.textContent = 'Reconnecting...';
        setTimeout(() => {
            if (stillActive()) connectChatSocket(path, stillActive);
        }, 3000);
    };
}

function updateActivePreview(msg) {
    const suffix = activeChat.kind === 'group' ? 'group-' + activeChat.id : activeChat.id;
    const preview = document.getElementById('last-msg-' + suffix);
    const timeEl = document.getElementById('last-time-' + suffix);
    if (preview) preview.textContent = notificationContent(msg);
    if (timeEl) timeEl.textContent = msg.timestamp || '';
}

function sendMessage(messageType = 'text', payload = null) {
    const input = document.getElementById('messageInput');
    const content = payload || input.value.trim();
    if (!content || !chatSocket || chatSocket.readyState !== WebSocket.OPEN) return;

    chatSocket.send(JSON.stringify({ message: content, message_type: messageType }));
    if (!payload) input.value = '';
    input.focus();
}

function handleKeyDown(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        sendMessage();
    }
}

async function toggleVoiceRecording() {
    const btn = document.getElementById('voiceBtn');
    if (mediaRecorder && mediaRecorder.state === 'recording') {
        mediaRecorder.stop();
        btn.classList.remove('recording');
        return;
    }

    if (!activeChat.kind) return alert('Open a chat first.');
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        return alert('Voice recording is not supported in this browser.');
    }

    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        voiceChunks = [];
        mediaRecorder = new MediaRecorder(stream);
        mediaRecorder.ondataavailable = event => {
            if (event.data.size > 0) voiceChunks.push(event.data);
        };
        mediaRecorder.onstop = () => {
            stream.getTracks().forEach(track => track.stop());
            const blob = new Blob(voiceChunks, { type: mediaRecorder.mimeType || 'audio/webm' });
            const reader = new FileReader();
            reader.onloadend = () => sendMessage('voice', reader.result);
            reader.readAsDataURL(blob);
        };
        mediaRecorder.start();
        btn.classList.add('recording');
    } catch (err) {
        alert('Microphone permission is required for voice notes.');
    }
}

async function startCall(kind) {
    if (!activeChat.kind) return alert('Open a chat first.');
    if (activeChat.kind !== 'direct') {
        sendMessage('call', kind === 'video' ? 'Started a group video call' : 'Started a group voice call');
        return alert('Group call signaling is not enabled yet. A call event was posted to the group.');
    }

    const wantsVideo = kind === 'video';
    currentCallKind = kind;
    document.getElementById('callModal').classList.add('open');
    document.getElementById('callTitle').textContent = wantsVideo ? 'Video Call' : 'Voice Call';
    document.getElementById('callStatus').textContent = `Calling ${activeChat.name}...`;

    try {
        await prepareLocalMedia(wantsVideo);
        createPeerConnection();
        localCallStream.getTracks().forEach(track => peerConnection.addTrack(track, localCallStream));
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        sendCallSignal({ action: 'offer', kind, sdp: offer });
        sendMessage('call', wantsVideo ? 'Started a video call' : 'Started a voice call');
    } catch (err) {
        document.getElementById('callStatus').textContent = 'Camera or microphone permission was blocked.';
    }
}

function endCall() {
    sendCallSignal({ action: 'hangup' });
    cleanupCall();
}

function cleanupCall() {
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }
    if (localCallStream) {
        localCallStream.getTracks().forEach(track => track.stop());
        localCallStream = null;
    }
    const localVideo = document.getElementById('localVideo');
    const remoteVideo = document.getElementById('remoteVideo');
    localVideo.srcObject = null;
    remoteVideo.srcObject = null;
    localVideo.style.display = 'none';
    remoteVideo.style.display = 'none';
    document.getElementById('callModal').classList.remove('open');
}

async function prepareLocalMedia(wantsVideo) {
    localCallStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: wantsVideo });
    const localVideo = document.getElementById('localVideo');
    localVideo.srcObject = localCallStream;
    localVideo.style.display = wantsVideo ? 'block' : 'none';
}

function createPeerConnection() {
    peerConnection = new RTCPeerConnection();
    peerConnection.onicecandidate = event => {
        if (event.candidate) {
            sendCallSignal({ action: 'ice', candidate: event.candidate });
        }
    };
    peerConnection.ontrack = event => {
        const remoteVideo = document.getElementById('remoteVideo');
        remoteVideo.srcObject = event.streams[0];
        remoteVideo.style.display = 'block';
        document.getElementById('callStatus').textContent = 'Connected';
    };
    peerConnection.onconnectionstatechange = () => {
        if (['closed', 'failed', 'disconnected'].includes(peerConnection.connectionState)) {
            document.getElementById('callStatus').textContent = 'Call ended';
        }
    };
}

function sendCallSignal(signal) {
    if (!chatSocket || chatSocket.readyState !== WebSocket.OPEN || activeChat.kind !== 'direct') return;
    chatSocket.send(JSON.stringify({ type: 'call_signal', signal }));
}

async function handleCallSignal(signal) {
    if (!signal || activeChat.kind !== 'direct') return;

    if (signal.action === 'offer') {
        const accept = confirm(`${activeChat.name} is calling. Answer?`);
        if (!accept) {
            sendCallSignal({ action: 'hangup' });
            return;
        }
        currentCallKind = signal.kind || 'audio';
        const wantsVideo = currentCallKind === 'video';
        document.getElementById('callModal').classList.add('open');
        document.getElementById('callTitle').textContent = wantsVideo ? 'Video Call' : 'Voice Call';
        document.getElementById('callStatus').textContent = `Connected with ${activeChat.name}`;
        await prepareLocalMedia(wantsVideo);
        createPeerConnection();
        localCallStream.getTracks().forEach(track => peerConnection.addTrack(track, localCallStream));
        await peerConnection.setRemoteDescription(new RTCSessionDescription(signal.sdp));
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        sendCallSignal({ action: 'answer', sdp: answer });
    }

    if (signal.action === 'answer' && peerConnection) {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(signal.sdp));
        document.getElementById('callStatus').textContent = 'Connected';
    }

    if (signal.action === 'ice' && peerConnection && signal.candidate) {
        try {
            await peerConnection.addIceCandidate(new RTCIceCandidate(signal.candidate));
        } catch (err) {
            console.warn('Could not add ICE candidate', err);
        }
    }

    if (signal.action === 'hangup') {
        cleanupCall();
    }
}

function appendMessage(msg, isSent, container) {
    const wrapper = document.createElement('div');
    wrapper.className = 'message-wrapper ' + (isSent ? 'sent' : 'received');

    let avatarHtml = '';
    if (!isSent) {
        if (msg.sender_pic) {
            avatarHtml = `<img class="msg-avatar" src="${msg.sender_pic}" alt="${escapeAttr(msg.sender_username)}">`;
        } else if (msg.sender_username) {
            avatarHtml = `<div class="msg-avatar-placeholder">${escapeHtml(msg.sender_username[0].toUpperCase())}</div>`;
        }
    }

    const senderName = activeChat.kind === 'group' && !isSent
        ? `<span class="sender-name">${escapeHtml(msg.sender_username)}</span>`
        : '';

    wrapper.innerHTML = `
        ${avatarHtml}
        <div class="message-bubble ${isSent ? 'sent' : 'received'}">
            ${senderName}
            ${renderMessageBody(msg)}
            <span class="msg-time">${escapeHtml(msg.timestamp || '')}</span>
        </div>
    `;
    container.appendChild(wrapper);
}

function renderMessageBody(msg) {
    if (msg.message_type === 'voice') {
        return `<audio class="voice-player" controls src="${escapeAttr(msg.content)}"></audio>`;
    }
    if (msg.message_type === 'call') {
        return `<div class="call-card">${escapeHtml(msg.content)}</div>`;
    }
    return escapeHtml(msg.content);
}

function filterContacts() {
    const query = document.getElementById('searchInput').value.toLowerCase();
    document.querySelectorAll('.contact-item').forEach(item => {
        const name = item.querySelector('.contact-name').textContent.toLowerCase();
        item.style.display = name.includes(query) ? 'flex' : 'none';
    });
    document.querySelectorAll('.section-label').forEach(label => {
        label.style.display = query ? 'none' : 'block';
    });
}

function openProfileModal() {
    document.getElementById('profileModal').classList.add('open');
}

function closeProfileModal() {
    document.getElementById('profileModal').classList.remove('open');
}

function openGroupModal() {
    document.getElementById('groupModal').classList.add('open');
}

function closeGroupModal() {
    document.getElementById('groupModal').classList.remove('open');
}

function openSignoutModal() {
    document.getElementById('signoutModal').classList.add('open');
}

function closeSignoutModal() {
    document.getElementById('signoutModal').classList.remove('open');
}

function previewImage(input) {
    if (input.files && input.files[0]) {
        const reader = new FileReader();
        reader.onload = function(e) {
            const preview = document.getElementById('modalPreviewImg');
            const placeholder = document.getElementById('modalPreviewPlaceholder');
            if (preview) {
                preview.src = e.target.result;
            } else if (placeholder) {
                const img = document.createElement('img');
                img.className = 'modal-avatar-preview';
                img.id = 'modalPreviewImg';
                img.src = e.target.result;
                placeholder.replaceWith(img);
            }
        };
        reader.readAsDataURL(input.files[0]);
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(text || ''));
    return div.innerHTML;
}

function escapeAttr(text) {
    return escapeHtml(text).replace(/"/g, '&quot;');
}

window.toggleTheme = toggleTheme;
window.openChat = openChat;
window.openGroupChat = openGroupChat;
window.openContactFromElement = openContactFromElement;
window.openGroupFromElement = openGroupFromElement;
window.openProfileFromContact = openProfileFromContact;
window.openContactProfileModal = openContactProfileModal;
window.closeContactProfileModal = closeContactProfileModal;
window.sendMessage = sendMessage;
window.handleKeyDown = handleKeyDown;
window.toggleVoiceRecording = toggleVoiceRecording;
window.startCall = startCall;
window.endCall = endCall;
window.openProfileModal = openProfileModal;
window.closeProfileModal = closeProfileModal;
window.openGroupModal = openGroupModal;
window.closeGroupModal = closeGroupModal;
window.openSignoutModal = openSignoutModal;
window.closeSignoutModal = closeSignoutModal;
window.previewImage = previewImage;
window.filterContacts = filterContacts;

function bindModalClose(id, closeFn) {
    const modal = document.getElementById(id);
    if (!modal) return;
    modal.addEventListener('click', function(e) {
        if (e.target === this) closeFn();
    });
}

bindModalClose('profileModal', closeProfileModal);
bindModalClose('contactProfileModal', closeContactProfileModal);
bindModalClose('groupModal', closeGroupModal);
bindModalClose('signoutModal', closeSignoutModal);
bindModalClose('callModal', endCall);

try {
    applySavedTheme();
    requestNotificationPermission();
    connectNotifications();
} catch (err) {
    console.error('ChatApp startup error:', err);
}
