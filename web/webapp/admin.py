from django.contrib import admin
from .models import UserProfile, Message, ChatGroup, GroupMessage, OTPCode

# Register your models here.
admin.site.register(UserProfile)
admin.site.register(Message)
admin.site.register(ChatGroup)
admin.site.register(GroupMessage)
admin.site.register(OTPCode)
