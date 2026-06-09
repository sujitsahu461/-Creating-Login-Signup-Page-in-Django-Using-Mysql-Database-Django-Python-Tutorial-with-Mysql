from django.shortcuts import render,redirect
from django.contrib.auth.models import User
from django.contrib.auth import login,logout,authenticate
from .models import UserProfile

# Create your views here.

def home(request):
    if request.user.is_authenticated:
        return render(request,'home.html')
    else:
        return redirect('/signin')

def signin(request):
    if request.user.is_authenticated:
        return redirect('/')
    else:
        if request.method == 'POST':
            username = request.POST['username']
            password = request.POST['password']
            user = authenticate(username=username,password=password)
            if user is not None:
                login(request,user)
                return redirect('/')
            else:
                return redirect('/signin')
        else:
            return render(request,"login.html")

def signout(request):
    logout(request)
    return redirect('/signin')

def signup(request):
    if request.method=="POST":
        username=request.POST.get('username')
        password=request.POST.get('password')
        confpassword=request.POST.get('confirmpassword')
        
        # Check if username already exists
        if User.objects.filter(username=username).exists():
            return render(request, "signup.html", {'error': 'Username already exists'})
        
        # Check if passwords match
        if password != confpassword:
            return render(request, "signup.html", {'error': 'Passwords do not match'})
        
        # Check if password is empty
        if not password or not username:
            return render(request, "signup.html", {'error': 'Username and password are required'})
        
        try:
            user = User.objects.create_user(username=username, password=password)
            user.save()
            UserProfile.objects.create(user=user)
            login(request, user)
            return redirect('/')
        except Exception as e:
            return render(request, "signup.html", {'error': 'Error creating account: ' + str(e)})
    else:
        return render(request,"signup.html")

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
            return render(request, 'home.html')
    else:
        return redirect('/signin')