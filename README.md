# agora-netex
Out of band bandwidth adaptation 


## AgoraRTCUtils.js
This javascript module provides some useful algorithms to work with the AgoraRTC 4.x SDK
These utils are all used in this reference app and you can refer to [../app.js](../app.js) for more detail.

#### Include the javascript:

         <script src="./AgoraRTCNetEx.js"></script>
                
#### Call the method 

Before publishing your video to the channel, call the optimizeNetworkControl method:

  AgoraRTCNetEx.optimizeNetworkControl(client,options.appid,null, 300, 3000);
  

  Pass the min and max bitrates you wish to move between and match your selected profile or encoder configuration.
  
  optimizeNetworkControl(client, rtm_appid, rtm_token, br_min, br_max)
  
  
## Function arguments      
client         The AgoraRTC client object returned from createClient method
rtm_appid      The RTM AppId to connect into an RTM channel
rtm_token      The RTM token to connect into an RTM channel (if tokens are enabled for this appid)
br_min         The lowest bitrate a client will encode at. Below this subscribers could move to a low stream alternative.   
br_max         The highest bitrate a client will encode at. Below this subscribers could move to a low stream alternative.   
