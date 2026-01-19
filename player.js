import { doc, onSnapshot, updateDoc, increment, collection, addDoc, serverTimestamp, orderBy, query, limit, getDocs, where } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
import { db, YOUTUBE_API_KEY } from "./config.js";

export const PlayerIcons = {
    play: "https://cdn-icons-png.flaticon.com/128/7238/7238961.png",
    pause: "https://cdn-icons-png.flaticon.com/128/6520/6520121.png",
    fullscreen: "https://cdn-icons-png.flaticon.com/128/7304/7304806.png",
    exitFullscreen: "https://cdn-icons-png.flaticon.com/128/8669/8669479.png",
    fitScreen: "https://cdn-icons-png.flaticon.com/128/80/80998.png",
    subtitle: "https://cdn-icons-png.flaticon.com/512/5009/5009382.png",
    settings: "https://cdn-icons-png.freepik.com/256/8999/8999687.png?semt=ais_white_label",
};

// UI references for Player
const PlayerUI = { 
    playerPageView: document.getElementById('player-page-view'), 
    playerWrapper: document.getElementById('player-wrapper'), 
    movieInfo: document.getElementById('movie-info'), 
    relatedContainer: document.getElementById('related-content-container'), 
    relatedTitle: document.getElementById('related-title'), 
    likeBtn: document.getElementById('like-btn'), 
    dislikeBtn: document.getElementById('dislike-btn'), 
    likeCount: document.getElementById('like-count'), 
    dislikeCount: document.getElementById('dislike-count'), 
    commentBtn: document.getElementById('comment-btn'), 
    commentSection: document.getElementById('comment-section'), 
    closeCommentsBtn: document.getElementById('close-comments-btn'), 
    commentForm: document.getElementById('comment-form'), 
    commentInput: document.getElementById('comment-input'), 
    commentsList: document.getElementById('comments-list'), 
    playerTitleHeader: document.getElementById('player-page-title-header') 
};

export const Player = {
    UI: PlayerUI,
    state: { movieRef: null, unsubscribe: null, currentVideoElement: null, controlsTimeout: null, hlsInstance: null, isScrubbing: false, playerType: 'movie', touchStartHandler: null, touchMoveHandler: null, touchEndHandler: null },
    init(id) {
        this.cleanupPlayer(); this.state.playerType = id.startsWith('moviesSections/') ? 'movie' : 'live';
        if (id.startsWith('youtube/')) { this.initYouTubeVideo(id.split('/')[1]); return; }
        if (this.state.unsubscribe) this.state.unsubscribe();
        const playerContent = document.createElement('div'); playerContent.className = 'player-content'; this.UI.playerWrapper.appendChild(playerContent);
        const loader = document.createElement('div'); loader.className = 'player-loader'; loader.innerHTML = `<i class="fas fa-spinner fa-spin"></i>`; this.UI.playerWrapper.appendChild(loader);
        this.UI.playerWrapper.classList.add('loading'); this.UI.movieInfo.innerHTML = ''; this.UI.relatedContainer.innerHTML = '';
        this.state.movieRef = doc(db, id); let isFirstLoad = true;
        this.state.unsubscribe = onSnapshot(this.state.movieRef, (docSnap) => {
            if (!docSnap.exists()) { this.UI.playerWrapper.classList.remove('loading'); playerContent.innerHTML = `<p class="text-center p-4">Content not available.</p>`; return; }
            const content = docSnap.data();
            if (isFirstLoad) {
                this.createPlayer(content.videoUrl || content.streamUrl, content.posterUrl || content.logoUrl, this.state.playerType);
                this.UI.playerTitleHeader.textContent = content.title || content.name;
                this.UI.movieInfo.innerHTML = `<h1 class="text-2xl md:text-3xl font-bold mb-2">${content.title||content.name}</h1><p class="text-gray-300">${content.description||''}</p>`;
                this.loadRelatedContent(id); this.setupActionHandlers(id); this.setupCommentSection(id); isFirstLoad = false;
            }
            this.UI.likeCount.textContent = content.likes || 0; this.UI.dislikeCount.textContent = content.dislikes || 0; this.updateActionButtonsUI(id);
        });
    },
    async initYouTubeVideo(videoId) {
        this.state.playerType = 'live'; const playerContent = document.createElement('div'); playerContent.className = 'player-content'; this.UI.playerWrapper.appendChild(playerContent);
        try {
            const response = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${videoId}&key=${YOUTUBE_API_KEY}`);
            const data = await response.json();
            if (data.items && data.items.length > 0) {
                const videoInfo = data.items[0].snippet;
                this.createPlayer(`https://www.youtube.com/embed/${videoId}?autoplay=1`, videoInfo.thumbnails.high.url, 'youtube');
                this.UI.playerTitleHeader.textContent = videoInfo.title;
                this.UI.movieInfo.innerHTML = `<h1 class="text-2xl md:text-3xl font-bold mb-2">${videoInfo.title}</h1><p class="text-gray-300">${videoInfo.description.replace(/\n/g, '<br>')}</p>`;
                document.getElementById('action-bar').style.display = 'none'; document.getElementById('related-content').style.display = 'none';
            } else { playerContent.innerHTML = `<p class="text-center p-4">YouTube video not found.</p>`; }
        } catch (error) { console.error("YouTube error:", error); playerContent.innerHTML = `<p class="text-center p-4">Could not load YouTube video.</p>`; }
    },
    createPlayer(videoUrl, posterUrl, playerType) {
        const playerContent = this.UI.playerWrapper.querySelector('.player-content'); 
        if (!playerContent) return;
        
        const lowerCaseUrl = videoUrl ? videoUrl.toLowerCase() : '';
        const isIframe = lowerCaseUrl.includes('bongobd.com') || lowerCaseUrl.includes('youtube.com/embed');
        const isDirectVideo = !isIframe && (lowerCaseUrl.includes('.m3u8') || ['.mp4', '.mkv', '.webm'].some(ext => lowerCaseUrl.includes(ext)));
        
        if (isDirectVideo && videoUrl) {
            playerContent.innerHTML = `<video id="video-player" poster="${posterUrl}" playsinline class="bg-black"></video>`;
            const video = document.getElementById('video-player'); 
            this.state.currentVideoElement = video;
            
            if (lowerCaseUrl.includes('.m3u8')) {
                if (Hls.isSupported()) { 
                    this.state.hlsInstance = new Hls(); 
                    this.state.hlsInstance.loadSource(videoUrl); 
                    this.state.hlsInstance.attachMedia(video); 
                    this.state.hlsInstance.on(Hls.Events.ERROR, function (event, data) {
                        if (data.fatal) {
                            switch (data.type) {
                                case Hls.ErrorTypes.NETWORK_ERROR:
                                    console.log('Network error, trying to recover...');
                                    this.state.hlsInstance.startLoad();
                                    break;
                                case Hls.ErrorTypes.MEDIA_ERROR:
                                    console.log('Media error, trying to recover...');
                                    this.state.hlsInstance.recoverMediaError();
                                    break;
                                default:
                                    this.state.hlsInstance.destroy();
                                    break;
                            }
                        }
                    });
                }
                else if (video.canPlayType('application/vnd.apple.mpegurl')) { 
                    video.src = videoUrl; 
                }
            } else { 
                video.src = videoUrl; 
            }
            
            if (playerType === 'movie') this.setupMovieControls(video); 
            else this.setupLiveTvControls(video);
            
        } else if (videoUrl) {
            this.UI.playerWrapper.classList.remove('loading'); 
            playerContent.innerHTML = `<iframe src="${videoUrl}" frameborder="0" allow="autoplay; fullscreen; encrypted-media" allowfullscreen></iframe>`;
            this.addRotatedViewButtons(); 
            this.state.currentVideoElement = null;
        } else { 
            this.UI.playerWrapper.classList.remove('loading'); 
            playerContent.innerHTML = `<p class="text-center p-4">No video source found.</p>`; 
        }
    },
    setupLiveTvControls(video) {
        this.UI.playerWrapper.insertAdjacentHTML('afterbegin', `<div id="volume-indicator-v" class="vertical-indicator"><i class="fas fa-volume-up"></i><div class="indicator-bar-container"><div class="indicator-bar-level"></div></div></div><div id="brightness-indicator-v" class="vertical-indicator"><i class="fas fa-sun"></i><div class="indicator-bar-container"><div class="indicator-bar-level"></div></div></div>`);
        const closeBtn = document.createElement('button'); closeBtn.className = 'view-mode-btn close-rotated-view-btn'; closeBtn.innerHTML = `<img src="${PlayerIcons.exitFullscreen}" alt="Exit Fullscreen" style="width: 20px; height: 20px; filter: brightness(0) invert(1);">`; closeBtn.onclick = (e) => { e.stopPropagation(); this.toggleRotateView(); };
        const controlsHTML = `
            <div id="custom-controls-overlay" class="visible"><button id="custom-play-pause-btn"><img src="${PlayerIcons.play}" alt="Play"></button></div>
            <div id="settings-panel"><button class="resolution-option">1080p</button><button class="resolution-option">720p</button><button class="resolution-option">480p</button><button class="resolution-option">Auto</button></div>
            <div id="player-controls-container-live"> <span class="live-indicator">LIVE</span>
                <div class="live-controls-right">
                    <button id="fit-screen-btn" class="player-control-btn"><img src="${PlayerIcons.fitScreen}" alt="Fit Screen"></button>
                    <button id="settings-btn" class="player-control-btn"><img src="${PlayerIcons.settings}" alt="Settings"></button>
                    <button class="enter-rotated-view-btn player-control-btn"><img src="${PlayerIcons.fullscreen}" alt="Fullscreen"></button>
                </div>
            </div>`;
        this.UI.playerWrapper.appendChild(closeBtn); this.UI.playerWrapper.insertAdjacentHTML('beforeend', controlsHTML);
        const centerPlayPauseBtn = document.getElementById('custom-play-pause-btn'), rotateBtn = this.UI.playerWrapper.querySelector('.enter-rotated-view-btn'), settingsBtn = document.getElementById('settings-btn'), settingsPanel = document.getElementById('settings-panel'), fitScreenBtn = document.getElementById('fit-screen-btn');
        const togglePlay = () => video.paused ? video.play() : video.pause();
        video.addEventListener('play', () => { centerPlayPauseBtn.innerHTML = `<img src="${PlayerIcons.pause}" alt="Pause">`; document.getElementById('custom-controls-overlay').classList.remove('visible'); });
        video.addEventListener('pause', () => { centerPlayPauseBtn.innerHTML = `<img src="${PlayerIcons.play}" alt="Play">`; document.getElementById('custom-controls-overlay').classList.add('visible'); });
        video.addEventListener('waiting', () => this.UI.playerWrapper.classList.add('loading'));
        video.addEventListener('playing', () => this.UI.playerWrapper.classList.remove('loading'));
        video.addEventListener('canplay', () => { this.UI.playerWrapper.classList.remove('loading'); video.play().catch(() => document.getElementById('custom-controls-overlay').classList.add('visible')); });
        centerPlayPauseBtn.addEventListener('click', (e) => { e.stopPropagation(); togglePlay(); });
        rotateBtn.onclick = (e) => { e.stopPropagation(); this.toggleRotateView(); };
        settingsBtn.addEventListener('click', (e) => { e.stopPropagation(); settingsPanel.classList.toggle('visible'); });
        fitScreenBtn.onclick = (e) => { e.stopPropagation(); video.classList.toggle('video-fit-cover'); };
        this.addTouchGestures(video);
    },
    setupMovieControls(video) {
        this.UI.playerWrapper.insertAdjacentHTML('afterbegin', `<div id="volume-indicator-v" class="vertical-indicator"><i class="fas fa-volume-up"></i><div class="indicator-bar-container"><div class="indicator-bar-level"></div></div></div><div id="brightness-indicator-v" class="vertical-indicator"><i class="fas fa-sun"></i><div class="indicator-bar-container"><div class="indicator-bar-level"></div></div></div>`);
        const closeBtn = document.createElement('button'); closeBtn.className = 'view-mode-btn close-rotated-view-btn'; closeBtn.innerHTML = `<img src="${PlayerIcons.exitFullscreen}" alt="Exit Fullscreen" style="width: 20px; height: 20px; filter: brightness(0) invert(1);">`; closeBtn.onclick = (e) => { e.stopPropagation(); this.toggleRotateView(); };
        const controlsHTML = `
            <div id="double-tap-overlay"><div class="tap-zone" id="tap-rewind"></div><div class="tap-zone" id="tap-forward"></div></div>
            <div id="custom-controls-overlay" class="visible"><button id="custom-play-pause-btn"><img src="${PlayerIcons.play}" alt="Play"></button></div>
            <div id="player-controls-container">
                <div id="progress-container"> <div id="progress-bar-wrapper"> <div id="progress-buffered"></div> <div id="progress-played"></div> <input type="range" id="progress-bar" value="0" min="0" step="1"> </div> </div>
                <div class="controls-bottom-bar">
                    <div class="controls-left"> <button id="play-pause-btn" class="player-control-btn"><img src="${PlayerIcons.play}" alt="Play"></button> <span id="time-display">00:00 / 00:00</span> </div>
                    <div class="controls-right"> <button id="fit-screen-btn" class="player-control-btn"><img src="${PlayerIcons.fitScreen}" alt="Fit Screen"></button> <button class="enter-rotated-view-btn player-control-btn"><img src="${PlayerIcons.fullscreen}" alt="Fullscreen"></button> </div>
                </div>
            </div>`;
        this.UI.playerWrapper.appendChild(closeBtn); this.UI.playerWrapper.insertAdjacentHTML('beforeend', controlsHTML);
        const centerPlayPauseBtn = document.getElementById('custom-play-pause-btn'), playPauseBtn = document.getElementById('play-pause-btn'), progressBar = document.getElementById('progress-bar'), progressBuffered = document.getElementById('progress-buffered'), progressPlayed = document.getElementById('progress-played'), timeDisplay = document.getElementById('time-display'), rotateBtn = this.UI.playerWrapper.querySelector('.enter-rotated-view-btn'), fitScreenBtn = document.getElementById('fit-screen-btn'), tapRewind = document.getElementById('tap-rewind'), tapForward = document.getElementById('tap-forward');
        const formatTime = (t) => { if(isNaN(t)) return '00:00'; const s=Math.floor(t%60),m=Math.floor(t/60)%60,h=Math.floor(t/3600); return h>0?`${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`:`${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`};
        const togglePlay = () => video.paused ? video.play() : video.pause();
        video.addEventListener('play', () => { playPauseBtn.innerHTML = `<img src="${PlayerIcons.pause}" alt="Pause">`; centerPlayPauseBtn.innerHTML = `<img src="${PlayerIcons.pause}" alt="Pause">`; document.getElementById('custom-controls-overlay').classList.remove('visible'); });
        video.addEventListener('pause', () => { playPauseBtn.innerHTML = `<img src="${PlayerIcons.play}" alt="Play">`; centerPlayPauseBtn.innerHTML = `<img src="${PlayerIcons.play}" alt="Play">`; document.getElementById('custom-controls-overlay').classList.add('visible'); });
        video.addEventListener('waiting', () => this.UI.playerWrapper.classList.add('loading')); video.addEventListener('playing', () => this.UI.playerWrapper.classList.remove('loading'));
        video.addEventListener('canplay', () => { this.UI.playerWrapper.classList.remove('loading'); video.play().catch(() => document.getElementById('custom-controls-overlay').classList.add('visible')); });
        video.addEventListener('loadedmetadata', () => { progressBar.max = video.duration; timeDisplay.textContent = `${formatTime(video.currentTime)} / ${formatTime(video.duration)}`; });
        video.addEventListener('timeupdate', () => { if (!this.state.isScrubbing) { progressBar.value = video.currentTime; progressPlayed.style.width = `${(video.currentTime / video.duration) * 100}%`; } timeDisplay.textContent = `${formatTime(video.currentTime)} / ${formatTime(video.duration)}`; });
        video.addEventListener('progress', () => { if (video.buffered.length > 0) { progressBuffered.style.width = `${(video.buffered.end(video.buffered.length - 1) / video.duration) * 100}%`; }});
        playPauseBtn.onclick = centerPlayPauseBtn.onclick = rotateBtn.onclick = fitScreenBtn.onclick = (e) => { e.stopPropagation(); if (e.currentTarget === playPauseBtn || e.currentTarget === centerPlayPauseBtn) togglePlay(); else if (e.currentTarget === rotateBtn) this.toggleRotateView(); else if (e.currentTarget === fitScreenBtn) video.classList.toggle('video-fit-cover'); };
        progressBar.addEventListener('mousedown', () => this.state.isScrubbing = true ); progressBar.addEventListener('mouseup', () => this.state.isScrubbing = false );
        progressBar.addEventListener('input', (e) => { const newTime = e.target.value; progressPlayed.style.width = `${(newTime / video.duration) * 100}%`; timeDisplay.textContent = `${formatTime(newTime)} / ${formatTime(video.duration)}`; });
        progressBar.addEventListener('change', () => video.currentTime = progressBar.value );
        const handleDoubleTap = (e) => { if (Date.now() - (this.state.lastTap || 0) < 300) { video.currentTime += (e.currentTarget.id === 'tap-forward' ? 10 : -10); this.state.lastTap = 0; } else { this.state.lastTap = Date.now(); }};
        tapRewind.addEventListener('click', handleDoubleTap); tapForward.addEventListener('click', handleDoubleTap);
        video.addEventListener('ended', () => { if (localStorage.getItem('autoplayNext') === 'true') { const nextLink = Player.UI.relatedContainer.querySelector('.content-link'); if (nextLink?.dataset.id) App.showPlayerPage(nextLink.dataset.id); } });
        this.addTouchGestures(video);
    },
    addTouchGestures(video) {
        const pWrap = this.UI.playerWrapper, volInd = document.getElementById('volume-indicator-v'), volLvl = volInd?.querySelector('.indicator-bar-level'), brtInd = document.getElementById('brightness-indicator-v'), brtLvl = brtInd?.querySelector('.indicator-bar-level');
        let sY=0,sX=0,isDrag=false,indTimeout,isTap=true;
        const showInd=(i,l,v)=>{if(!i||!l)return;l.style.height=`${v*100}%`;i.classList.add('visible');clearTimeout(indTimeout);indTimeout=setTimeout(()=>i.classList.remove('visible'),1500)};
        
        this.state.touchStartHandler = (e) => { if(e.touches.length===1){const t=e.touches[0];sY=t.clientY;sX=t.clientX;isDrag=false;isTap=true}};
        this.state.touchMoveHandler = (e) => {if(e.touches.length!==1||e.target.closest('#player-controls-container,#player-controls-container-live'))return;const t=e.touches[0];if(isTap&&(Math.abs(t.clientX-sX)>10||Math.abs(t.clientY-sY)>10)){isTap=false}if(isTap)return;isDrag=true;e.preventDefault();const r=pWrap.getBoundingClientRect();let dY=sY-t.clientY;if(pWrap.classList.contains('rotated-view')){dY=-(sX-t.clientX)}if(sX<r.width/2){let cB=parseFloat(pWrap.style.filter?.replace('brightness(','').replace(')',''))||1;cB=Math.max(.2,Math.min(1.5,cB+dY/200));pWrap.style.filter=`brightness(${cB})`;showInd(brtInd,brtLvl,(cB-.2)/1.3)}else{video.volume=Math.max(0,Math.min(1,video.volume+dY/200));showInd(volInd,volLvl,video.volume)}sY=t.clientY;sX=t.clientX};
        this.state.touchEndHandler = (e) => {
            if(isTap && !isDrag && !e.target.closest('button, input')) {
                const vis=pWrap.classList.toggle('controls-visible');
                if(video.paused && vis){ document.getElementById('custom-controls-overlay')?.classList.add('visible') }
                else { document.getElementById('custom-controls-overlay')?.classList.remove('visible') }
                if(vis){
                    clearTimeout(this.state.controlsTimeout);
                    if(!video.paused){
                        this.state.controlsTimeout = setTimeout(() => {
                            pWrap.classList.remove('controls-visible');
                            document.getElementById('custom-controls-overlay')?.classList.remove('visible');
                        }, 3000)
                    }
                }
            }
            isDrag=false;
            clearTimeout(indTimeout);
            indTimeout=setTimeout(()=>{volInd?.classList.remove('visible');brtInd?.classList.remove('visible')},500)
        };

        pWrap.addEventListener('touchstart', this.state.touchStartHandler, {passive:true});
        pWrap.addEventListener('touchmove', this.state.touchMoveHandler, {passive:false});
        pWrap.addEventListener('touchend', this.state.touchEndHandler);
        video.addEventListener('volumechange',()=>{if(volLvl)volLvl.style.height=`${video.volume*100}%`});
    },
    addRotatedViewButtons() {
        const closeBtn=document.createElement('button');closeBtn.className='view-mode-btn close-rotated-view-btn';closeBtn.innerHTML=`<img src="${PlayerIcons.exitFullscreen}" alt="Exit Fullscreen" style="width:20px;height:20px;filter:brightness(0) invert(1);">`;closeBtn.onclick=(e)=>{e.stopPropagation();this.toggleRotateView()};
        const enterBtn=document.createElement('button');enterBtn.className='view-mode-btn enter-rotated-view-btn';enterBtn.innerHTML=`<img src="${PlayerIcons.fullscreen}" alt="Fullscreen" style="width:20px;height:20px;filter:brightness(0) invert(1);">`;enterBtn.onclick=(e)=>{e.stopPropagation();this.toggleRotateView()};
        this.UI.playerWrapper.appendChild(closeBtn);this.UI.playerWrapper.appendChild(enterBtn);
    },
    toggleRotateView() { const isRotated = this.UI.playerWrapper.classList.toggle('rotated-view'); document.body.style.overflow = isRotated ? 'hidden' : ''; },
    cleanupPlayer() {
        if (this.state.touchStartHandler) {
            this.UI.playerWrapper.removeEventListener('touchstart', this.state.touchStartHandler);
            this.state.touchStartHandler = null;
        }
        if (this.state.touchMoveHandler) {
            this.UI.playerWrapper.removeEventListener('touchmove', this.state.touchMoveHandler);
            this.state.touchMoveHandler = null;
        }
        if (this.state.touchEndHandler) {
            this.UI.playerWrapper.removeEventListener('touchend', this.state.touchEndHandler);
            this.state.touchEndHandler = null;
        }

        if(this.state.hlsInstance){this.state.hlsInstance.destroy();this.state.hlsInstance=null}
        if(this.state.currentVideoElement){this.state.currentVideoElement.pause();this.state.currentVideoElement.src='';this.state.currentVideoElement.load()}
        this.UI.playerWrapper.innerHTML='';
        this.UI.playerWrapper.className='relative w-full bg-black';
        this.UI.playerWrapper.style.filter='';
        clearTimeout(this.state.controlsTimeout);
        document.body.style.overflow='';
        document.getElementById('action-bar').style.display='flex';
        document.getElementById('related-content').style.display='block';
    },
    destroyPlayer() { this.cleanupPlayer(); if (this.state.unsubscribe) { this.state.unsubscribe(); this.state.unsubscribe = null; } },
    async loadRelatedContent(path) {
        this.UI.relatedContainer.innerHTML = '';
        const cId = path.split('/').pop();
        const isLive = path.startsWith('liveTV');
        const colPath = isLive ? 'liveTV' : path.substring(0, path.lastIndexOf('/'));
        
        this.UI.relatedTitle.innerHTML = `<span class="text-gray-300 font-normal text-sm">UP NEXT</span>`;
        this.UI.relatedTitle.className = 'mb-4 block border-b border-gray-800 pb-2';

        this.UI.relatedContainer.className = 'flex flex-col space-y-4 pb-20'; 

        const q = query(collection(db, colPath), where("__name__", "!=", cId), limit(15));
        const snap = await getDocs(q);

        snap.forEach(d => {
            const con = d.data();
            const card = document.createElement('div');
            
            const imgSrc = con.posterUrl || con.logoUrl;
            const imgClass = isLive 
                ? 'object-contain p-2 bg-[#1f1f1f]' 
                : 'object-cover'; 
            
            const badge = isLive 
                ? `<span class="absolute bottom-1 right-1 text-[9px] bg-red-600 text-white px-1.5 py-0.5 rounded font-bold tracking-wider">LIVE</span>` 
                : (con.duration ? `<span class="absolute bottom-1 right-1 text-[9px] bg-black/80 text-white px-1.5 py-0.5 rounded font-medium">${con.duration}</span>` : '');

            card.className = 'w-full';
            
            card.innerHTML = `
                <a href="#" data-id="${colPath}/${d.id}" class="content-link flex gap-3 group h-24 w-full">
                    <div class="relative w-40 flex-shrink-0 rounded-lg overflow-hidden bg-[#111] border border-gray-800">
                        <img alt="${con.title || con.name}" src="${imgSrc}" loading="lazy" class="w-full h-full ${imgClass} transition-opacity duration-300 group-hover:opacity-80"/>
                        ${badge}
                         <div class="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity">
                            <i class="fas fa-play text-white text-xs"></i>
                        </div>
                    </div>
                    
                    <div class="flex flex-col py-1 min-w-0 flex-grow">
                        <h4 class="text-white text-[15px] font-medium leading-snug line-clamp-2 group-hover:text-[var(--primary-color)] transition-colors">
                            ${con.title || con.name}
                        </h4>
                        <div class="mt-1 flex flex-col gap-0.5">
                            <p class="text-[12px] text-gray-400 truncate">
                                ${con.category || 'Ti Sports'}
                            </p>
                            <p class="text-[11px] text-gray-500">
                                Recommended for you
                            </p>
                        </div>
                    </div>
                    
                    <div class="flex-shrink-0 pt-1">
                        <button class="text-gray-500 hover:text-white p-1"><i class="fas fa-ellipsis-v text-xs"></i></button>
                    </div>
                </a>
            `;
            this.UI.relatedContainer.appendChild(card);
        });
        
        if (snap.empty) {
            this.UI.relatedContainer.innerHTML = '<p class="text-gray-500 text-sm text-center py-4">No related videos found.</p>';
        }
    },
    setupActionHandlers(p){const k=`action_${p.replace(/\//g,'_')}`;this.UI.likeBtn.onclick=()=>this.handleVote('likes',k);this.UI.dislikeBtn.onclick=()=>this.handleVote('dislikes',k)},async handleVote(t,k){const c=localStorage.getItem(k),o=t==='likes'?'dislikes':'likes';let u={};c===t?(u[t]=increment(-1),localStorage.removeItem(k)):(u[t]=increment(1),c&&(u[o]=increment(-1)),localStorage.setItem(k,t));await updateDoc(this.state.movieRef,u)},updateActionButtonsUI(p){const k=`action_${p.replace(/\//g,'_')}`,v=localStorage.getItem(k);this.UI.likeBtn.classList.toggle('active',v==='likes');this.UI.dislikeBtn.classList.toggle('active',v==='dislikes')},setupCommentSection(p){const c=collection(db,`${p}/comments`);this.UI.commentBtn.onclick=()=>this.UI.commentSection.classList.add('open');this.UI.closeCommentsBtn.onclick=()=>this.UI.commentSection.classList.remove('open');this.UI.commentForm.onsubmit=async e=>{e.preventDefault();const t=this.UI.commentInput.value.trim();if(t){await addDoc(c,{text:t,author:"User",createdAt:serverTimestamp()});this.UI.commentInput.value=''}};this.listenForComments(c)},listenForComments(r){onSnapshot(query(r,orderBy('createdAt','desc')),s=>{this.UI.commentsList.innerHTML='';s.forEach(d=>{const c=d.data(),a=c.createdAt?.toDate().toLocaleString()||'',e=document.createElement('div');e.className='border-b border-gray-700 py-3';e.innerHTML=`<div class="flex items-start space-x-3"><i class="fas fa-user-circle text-2xl text-gray-400"></i><div><p class="font-semibold">${c.author} <span class="text-xs text-gray-500 ml-2">${a}</span></p><p class="text-gray-300 break-words">${c.text}</p></div></div>`;this.UI.commentsList.appendChild(e)})})}
};