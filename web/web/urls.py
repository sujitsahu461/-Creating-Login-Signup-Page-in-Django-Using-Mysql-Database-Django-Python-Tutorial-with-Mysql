from django.contrib import admin
from django.urls import path
from webapp.views import *
from django.conf import settings
from django.conf.urls.static import static

urlpatterns = [
    path('admin/', admin.site.urls),
    path('', home),
    path('home/', home),
    path('signin/', signin),
    path('signout/', signout),
    path('signup/', signup),
    path('verify_otp/', verify_otp),
    path('upload/', upload),
    path('update_phone/', update_phone),
    path('get_profile/', get_profile),
    path('create_group/', create_group),
    path('send_message/', send_message),
    path('get_messages/<int:user_id>/', get_messages),
    path('get_group_messages/<int:group_id>/', get_group_messages),
    path('get_unread_counts/', get_unread_counts),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
