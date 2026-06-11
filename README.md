# ChatApp - Real-Time Messaging Platform

A full-featured **WhatsApp Web-inspired** real-time chat application built with **Django**, **Django Channels**, and **WebSockets**. Features instant messaging, OTP phone verification, browser notifications, and online presence tracking.

---

## Features

| Feature | Description |
|---------|-------------|
| **Real-Time Chat** | Instant message delivery via WebSockets (Django Channels + Daphne ASGI) |
| **OTP Phone Verification** | 6-digit OTP sent to console during signup for phone number verification |
| **Browser Notifications** | Push notifications when receiving messages, even in background tabs |
| **In-App Toast Alerts** | Slide-in notification toasts with sender info and message preview |
| **Online Presence** | Real-time online/offline status with green indicator dots |
| **Profile Management** | Upload profile picture, view/update phone number |
| **Unread Message Badges** | Unread count badges on contacts in the sidebar |
| **Contact Search** | Filter contacts by username in the sidebar |
| **Sign Out Confirmation** | Confirmation modal before signing out |
| **Auto-Reconnect** | WebSocket auto-reconnects on connection drop |
| **Responsive Timestamps** | Real IST timestamps on all messages |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Backend** | Python 3.14, Django 6.0 |
| **WebSocket Server** | Django Channels 4.3 + Daphne (ASGI) |
| **Database** | MySQL |
| **Frontend** | HTML5, CSS3, Vanilla JavaScript |
| **Real-Time** | WebSocket API (browser) + Channels (server) |
| **Auth** | Django Authentication + Custom OTP |
| **Channel Layer** | InMemoryChannelLayer (dev) |

---

## Screenshots

### Login Page
> WhatsApp-inspired dark theme login with username/password

### Chat Interface
> Sidebar with contacts, online dots, unread badges + chat panel with message bubbles

### OTP Verification
> 6-digit OTP input with auto-focus and paste support

---

## Project Structure

```
Django Python Tutorial with Mysql/
|-- web/
|   |-- web/                    # Django project settings
|   |   |-- settings.py         # Django + Channels config
|   |   |-- urls.py             # HTTP URL routes
|   |   |-- asgi.py             # ASGI application (HTTP + WebSocket)
|   |   |-- wsgi.py             # WSGI fallback
|   |
|   |-- webapp/                 # Main application
|   |   |-- models.py           # UserProfile, Message, OTPCode models
|   |   |-- views.py            # Auth, chat, OTP, profile views
|   |   |-- consumers.py        # WebSocket consumers (Chat + Notifications)
|   |   |-- routing.py          # WebSocket URL routing
|   |   |-- static/
|   |   |   |-- webapp/
|   |   |       |-- home.js     # Frontend WebSocket + UI logic
|   |   |-- migrations/
|   |
|   |-- template/               # HTML templates
|   |   |-- login.html          # Sign in page
|   |   |-- signup.html         # Sign up with phone number
|   |   |-- verify_otp.html     # OTP verification page
|   |   |-- home.html           # Main chat interface
|   |
|   |-- media/                  # Uploaded profile pictures
|   |-- manage.py
```

---

## Installation & Setup

### Prerequisites

- Python 3.10+
- MySQL Server
- pip

### 1. Clone the Repository

```bash
git clone https://github.com/sujitsahu461/-Creating-Login-Signup-Page-in-Django-Using-Mysql-Database-Django-Python-Tutorial-with-Mysql.git
cd "-Creating-Login-Signup-Page-in-Django-Using-Mysql-Database-Django-Python-Tutorial-with-Mysql"
```

### 2. Install Dependencies

```bash
pip install django mysqlclient channels daphne
```

### 3. Configure MySQL Database

Create a MySQL database named `web`:

```sql
CREATE DATABASE web;
```

Update credentials in `web/web/settings.py` if needed:

```python
DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.mysql',
        'NAME': 'web',
        'USER': 'root',
        'PASSWORD': 'ROOT',
        'HOST': 'localhost',
    }
}
```

### 4. Run Migrations

```bash
cd web
python manage.py makemigrations
python manage.py migrate
```

### 5. Create Superuser (Optional - for Admin panel)

```bash
python manage.py createsuperuser
```

### 6. Start the Server

```bash
python manage.py runserver
```

> With `daphne` in `INSTALLED_APPS`, the dev server automatically runs as an **ASGI server** with full WebSocket support.

### 7. Open in Browser

```
http://127.0.0.1:8000
```

---

## How It Works

### Authentication Flow

```
Sign Up --> Enter username, phone, password
        --> OTP generated & printed to terminal
        --> Enter 6-digit OTP
        --> Account created & logged in

Sign In --> Username + Password
        --> Redirected to chat
```

### WebSocket Architecture

```
Browser                          Server (Daphne ASGI)
  |                                    |
  |-- ws://host/ws/notifications/ ---->| NotificationConsumer
  |       (global, per-user)           |   - Online/offline tracking
  |                                    |   - Message notifications
  |                                    |
  |-- ws://host/ws/chat/<user_id>/ -->| ChatConsumer
  |       (per-conversation)           |   - Message history
  |                                    |   - Real-time send/receive
  |                                    |   - Read receipts
```

### Online Presence System

```
User opens page --> NotificationConsumer.connect()
                --> Added to online_users set
                --> Broadcast "online" to all users
                --> Green dot appears

User closes tab --> NotificationConsumer.disconnect()
                --> Removed from online_users set
                --> Broadcast "offline" to all users
                --> Dot turns grey
```

---

## API Endpoints

| Method | URL | Description |
|--------|-----|-------------|
| GET | `/` | Home / Chat page |
| GET/POST | `/signin/` | Login page |
| GET/POST | `/signup/` | Registration with phone |
| GET/POST | `/verify_otp/` | OTP verification |
| GET | `/signout/` | Logout |
| POST | `/upload/` | Upload profile picture |
| POST | `/update_phone/` | Update phone number |
| GET | `/get_profile/` | Get user profile (JSON) |
| POST | `/send_message/` | Send message (fallback) |
| GET | `/get_messages/<user_id>/` | Get messages (fallback) |
| GET | `/get_unread_counts/` | Get unread counts (fallback) |

### WebSocket Endpoints

| URL | Consumer | Purpose |
|-----|----------|---------|
| `ws/chat/<user_id>/` | ChatConsumer | 1-to-1 real-time chat |
| `ws/notifications/` | NotificationConsumer | Notifications + presence |

---

## Models

### UserProfile
| Field | Type | Description |
|-------|------|-------------|
| user | OneToOneField(User) | Linked Django user |
| profile_pic | ImageField | Profile picture |
| phone_number | CharField(15) | Phone number |

### Message
| Field | Type | Description |
|-------|------|-------------|
| sender | ForeignKey(User) | Message sender |
| receiver | ForeignKey(User) | Message receiver |
| content | TextField | Message text |
| timestamp | DateTimeField | Auto-set on creation |
| is_read | BooleanField | Read status |

### OTPCode
| Field | Type | Description |
|-------|------|-------------|
| phone_number | CharField | Phone for OTP |
| code | CharField(6) | 6-digit OTP code |
| username | CharField | Pending username |
| password | CharField | Pending password |
| is_used | BooleanField | Whether OTP was used |

---

## OTP Testing

Since this uses **console OTP** (no SMS provider), the OTP is printed to the terminal:

```
==================================================
  OTP for 9876543210: 483721
==================================================
```

> To add real SMS (Twilio, MSG91), replace the `print()` in `views.py` with your SMS API call.

---

## Future Enhancements

- [ ] Group chat support
- [ ] Media sharing (images, files)
- [ ] Message editing & deletion
- [ ] Typing indicators
- [ ] Voice & video calls (WebRTC)
- [ ] End-to-end encryption
- [ ] Redis channel layer (production)
- [ ] Real SMS OTP (Twilio/MSG91)
- [ ] Message search
- [ ] Dark/Light theme toggle

---

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## Author

**Sujit Sahu** - [@sujitsahu461](https://github.com/sujitsahu461)

---

## License

This project is open source and available under the [MIT License](LICENSE).
