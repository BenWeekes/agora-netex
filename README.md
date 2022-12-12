
## AgoraRTCNetEx.js
This javascript module provides an 'Out of band' bandwidth adaptation algorithms to work alongside the AgoraRTC 4.x SDK.
It can produce better results than the standard webrtc alogirthm which can be oversensitive for some real-time engagement applications. 

#### Include the javascript:

         <script src="./AgoraRTCNetEx.js"></script>
                
#### Call the method 

Before publishing your video to the channel, call the optimizeNetworkControl method:

  AgoraRTCNetEx.optimizeNetworkControl(client,options.appid,null, 300, 3000);       
  
Pass in the min and max bitrates that you wish to move between and match those of your selected profile.     
  
## Function arguments      

optimizeNetworkControl(client, rtm_appid, rtm_token, br_min, br_max)

client         The AgoraRTC client object returned from createClient method.     
rtm_appid      The RTM AppId to connect into an RTM channel.     
rtm_token      The RTM token to connect into an RTM channel (if tokens are enabled for this appid)       
br_min         The lowest bitrate a client will encode at. Below this subscribers could move to a low stream alternative.       
br_max         The highest bitrate a client will encode at. Below this subscribers could move to a low stream alternative.       
