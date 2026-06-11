from django.shortcuts import render, redirect
from django.contrib.auth.models import User
from django.contrib.auth import login, logout, authenticate
from django.http import JsonResponse
from .models import UserProfile, Message, OTPCode
import json

# Create your views here.

def home(request):
    if request.user.is_authenticated:
        users = User.objects.exclude(id=request.user.id)
        UserProfile.objects.get_or_create(user=request.user)
        return render(request, 'home.html', {'users': users})
    else:
        return redirect('/signin')

def signin(request):
    if request.user.is_authenticated:
        return redirect('/')
    else:
        if request.method == 'POST':
            username = request.POST['username']
            password = request.POST['password']
            user = authenticate(username=username, password=password)
            if user is not None:
                login(request, user)
                return redirect('/')
            else:
                return render(request, "login.html", {'error': 'Invalid username or password'})
        else:
            return render(request, "login.html")

def signout(request):
    logout(request)
    return redirect('/signin')

def signup(request):
    if request.method == "POST":
        username = request.POST.get('username')
        phone = request.POST.get('phone')
        password = request.POST.get('password')
        confpassword = request.POST.get('confirmpassword')

        if User.objects.filter(username=username).exists():
            return render(request, "signup.html", {'error': 'Username already exists'})

        if password != confpassword:
            return render(request, "signup.html", {'error': 'Passwords do not match'})

        if not password or not username or not phone:
            return render(request, "signup.html", {'error': 'All fields are required'})

        if len(phone) < 10:
            return render(request, "signup.html", {'error': 'Enter a valid phone number'})

        # Generate OTP and print to console (dev mode)
        code = OTPCode.generate_code()
        OTPCode.objects.create(
            phone_number=phone,
            code=code,
            username=username,
            password=password,
        )

        # Print OTP to terminal for testing
        print(f"\n{'='*50}")
        print(f"  📱 OTP for {phone}: {code}")
        print(f"{'='*50}\n")

        # Store in session for OTP verification page
        request.session['otp_phone'] = phone
        request.session['otp_username'] = username

        return redirect('/verify_otp/')

    else:
        return render(request, "signup.html")

def verify_otp(request):
    phone = request.session.get('otp_phone')
    username = request.session.get('otp_username')

    if not phone or not username:
        return redirect('/signup/')

    if request.method == 'POST':
        entered_code = request.POST.get('otp', '')

        # Find the latest unused OTP for this phone
        otp_obj = OTPCode.objects.filter(
            phone_number=phone,
            username=username,
            is_used=False,
        ).order_by('-created_at').first()

        if not otp_obj:
            return render(request, 'verify_otp.html', {
                'error': 'OTP expired. Please sign up again.',
                'phone': phone,
            })

        if otp_obj.code != entered_code:
            return render(request, 'verify_otp.html', {
                'error': 'Invalid OTP. Please try again.',
                'phone': phone,
            })

        # OTP is correct — create the user
        otp_obj.is_used = True
        otp_obj.save()

        try:
            user = User.objects.create_user(username=otp_obj.username, password=otp_obj.password)
            user.save()
            profile = UserProfile.objects.create(user=user, phone_number=phone)
            login(request, user)

            # Clean session
            del request.session['otp_phone']
            del request.session['otp_username']

            return redirect('/')
        except Exception as e:
            return render(request, 'verify_otp.html', {
                'error': f'Error creating account: {str(e)}',
                'phone': phone,
            })
    else:
        return render(request, 'verify_otp.html', {'phone': phone})

def upload(request):
    if request.user.is_authenticated:
        if request.method == 'POST':
            if 'pic' in request.FILES:
                pic = request.FILES['pic']
                user_profile, created = UserProfile.objects.get_or_create(user=request.user)
                user_profile.profile_pic = pic
                user_profile.save()
                return redirect('/')
            else:
                return redirect('/')
        else:
            return redirect('/')
    else:
        return redirect('/signin')

def update_phone(request):
    if not request.user.is_authenticated:
        return redirect('/signin')
    if request.method == 'POST':
        phone = request.POST.get('phone', '').strip()
        if phone and len(phone) >= 10:
            profile, created = UserProfile.objects.get_or_create(user=request.user)
            profile.phone_number = phone
            profile.save()
    return redirect('/')

def get_profile(request):
    if not request.user.is_authenticated:
        return JsonResponse({'error': 'Not authenticated'}, status=401)
    try:
        profile = request.user.userprofile
        pic_url = profile.profile_pic.url if profile.profile_pic else ''
        return JsonResponse({
            'username': request.user.username,
            'phone': profile.phone_number or '',
            'pic': pic_url,
        })
    except UserProfile.DoesNotExist:
        return JsonResponse({
            'username': request.user.username,
            'phone': '',
            'pic': '',
        })

# Keep these for fallback / initial load
def send_message(request):
    if not request.user.is_authenticated:
        return JsonResponse({'error': 'Not authenticated'}, status=401)
    if request.method == 'POST':
        data = json.loads(request.body)
        receiver_id = data.get('receiver_id')
        content = data.get('content', '').strip()
        if not content:
            return JsonResponse({'error': 'Empty message'}, status=400)
        try:
            receiver = User.objects.get(id=receiver_id)
            msg = Message.objects.create(
                sender=request.user,
                receiver=receiver,
                content=content
            )
            return JsonResponse({
                'id': msg.id,
                'content': msg.content,
                'timestamp': msg.timestamp.strftime('%H:%M'),
                'sender_id': request.user.id,
            })
        except User.DoesNotExist:
            return JsonResponse({'error': 'User not found'}, status=404)
    return JsonResponse({'error': 'Invalid method'}, status=405)

def get_messages(request, user_id):
    if not request.user.is_authenticated:
        return JsonResponse({'error': 'Not authenticated'}, status=401)
    try:
        other_user = User.objects.get(id=user_id)
        messages = Message.objects.filter(
            sender=request.user, receiver=other_user
        ) | Message.objects.filter(
            sender=other_user, receiver=request.user
        )
        messages = messages.order_by('timestamp')
        Message.objects.filter(sender=other_user, receiver=request.user, is_read=False).update(is_read=True)

        data = []
        for msg in messages:
            try:
                pic_url = msg.sender.userprofile.profile_pic.url if msg.sender.userprofile.profile_pic else ''
            except Exception:
                pic_url = ''
            data.append({
                'id': msg.id,
                'content': msg.content,
                'timestamp': msg.timestamp.strftime('%H:%M'),
                'sender_id': msg.sender.id,
                'sender_username': msg.sender.username,
                'sender_pic': pic_url,
            })
        return JsonResponse({'messages': data})
    except User.DoesNotExist:
        return JsonResponse({'error': 'User not found'}, status=404)

def get_unread_counts(request):
    if not request.user.is_authenticated:
        return JsonResponse({'error': 'Not authenticated'}, status=401)
    users = User.objects.exclude(id=request.user.id)
    counts = {}
    for u in users:
        counts[u.id] = Message.objects.filter(sender=u, receiver=request.user, is_read=False).count()
    return JsonResponse({'counts': counts})