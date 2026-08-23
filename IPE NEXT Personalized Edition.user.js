// ==UserScript==
// @name         IPE NEXT 个人定制版
// @namespace    https://github.com/lylx1997
// @version      0.3.1
// @description  动态加载 InPageEdit NEXT，集成位置记忆、双击归位、防抖、样式及中文翻译一致性优化，实现跨浏览器的悬浮、自动隐藏滚动条。
// @author       乐与乐寻
// @match        https://wiki.biligame.com/*
// @grant        GM_registerMenuCommand
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_unregisterMenuCommand
// @license      MIT
// ==/UserScript==

(function () {
    'use strict';

    const STORAGE_KEY = 'ipe-toolbox-position';

    // ========== 沙箱层：仅负责菜单注册与跨上下文通信 ==========
    if (typeof GM_registerMenuCommand !== 'undefined') {
        GM_registerMenuCommand('🔄 工具箱一键归位', () => {
            localStorage.removeItem(STORAGE_KEY);
            window.postMessage({ type: 'IPE_RESET_POSITION' }, '*');
        });
    }

    // --- 翻译功能菜单 ---
    let isTranslateEnabled = (typeof GM_getValue !== 'undefined')
        ? GM_getValue('ipe-translate-enabled', true)
        : true;

    let translateMenuId = null;

    function updateTranslateMenu() {
        if (translateMenuId !== null && typeof GM_unregisterMenuCommand !== 'undefined') {
            GM_unregisterMenuCommand(translateMenuId);
        }
        translateMenuId = GM_registerMenuCommand(
            isTranslateEnabled ? '✅ 窗口翻译已开启' : '❌ 窗口翻译已关闭',
            toggleTranslate
        );
    }

    const toggleTranslate = () => {
        isTranslateEnabled = !isTranslateEnabled;
        if (typeof GM_setValue !== 'undefined') {
            GM_setValue('ipe-translate-enabled', isTranslateEnabled);
        }
        window.postMessage({ type: 'IPE_TRANSLATE_TOGGLE', enabled: isTranslateEnabled }, '*');
        updateTranslateMenu();
    };

    // --- 阻止遮罩关闭菜单 ---
    let isPreventMaskEnabled = (typeof GM_getValue !== 'undefined')
        ? GM_getValue('ipe-prevent-mask-enabled', true)
        : true;

    let preventMaskMenuId = null;

    function updatePreventMaskMenu() {
        if (preventMaskMenuId !== null && typeof GM_unregisterMenuCommand !== 'undefined') {
            GM_unregisterMenuCommand(preventMaskMenuId);
        }
        preventMaskMenuId = GM_registerMenuCommand(
            isPreventMaskEnabled ? '✅ 阻止遮罩事件' : '❌ 阻止遮罩事件',
            togglePreventMask
        );
    }

    const togglePreventMask = () => {
        isPreventMaskEnabled = !isPreventMaskEnabled;
        if (typeof GM_setValue !== 'undefined') {
            GM_setValue('ipe-prevent-mask-enabled', isPreventMaskEnabled);
        }
        window.postMessage({ type: 'IPE_PREVENT_MASK_TOGGLE', enabled: isPreventMaskEnabled }, '*');
        updatePreventMaskMenu();
    };

    window.addEventListener('message', function(e) {
        if (e.data && e.data.type === 'IPE_REQUEST_INITIAL_STATE') {
            window.postMessage({ type: 'IPE_TRANSLATE_TOGGLE', enabled: isTranslateEnabled }, '*');
            window.postMessage({ type: 'IPE_PREVENT_MASK_TOGGLE', enabled: isPreventMaskEnabled }, '*');
        }
    });

    if (typeof GM_registerMenuCommand !== 'undefined') {
        updateTranslateMenu();
        updatePreventMaskMenu();
    }

    // ========== 页面上下文层：所有 DOM/CSS/RLQ 操作在此执行 ==========
    const pageScript = document.createElement('script');
    pageScript.textContent = `(function() {
        'use strict';
        const STORAGE_KEY = '${STORAGE_KEY}';
        window.RLQ = window.RLQ || [];
        window.RLQ.push(function() {
            // 1. 注入自定义 CSS
            const customCSS = [
                '/* 隐藏原生滚动条 */',
                'html { scrollbar-width: none; -ms-overflow-style: none; }',
                'html::-webkit-scrollbar { display: none; }',
                '/* 滚动条轨道容器 */',
                '#custom-fake-scrollbar, #custom-fake-scrollbar-h {',
                ' position: fixed; z-index: 99999; pointer-events: none; opacity: 0;',
                ' transition: opacity 0.3s ease;',
                '}',
                '#custom-fake-scrollbar.visible, #custom-fake-scrollbar-h.visible {',
                ' opacity: 1; pointer-events: auto;',
                '}',
                '#custom-fake-scrollbar { top: 0; right: 1px; width: 6px; height: 100vh; }',
                '#custom-fake-scrollbar-h { bottom: -6px; left: 0; height: 6px; width: 100vw; }',
                '/* 滑块默认样式 */',
                '#custom-fake-scrollbar .thumb, #custom-fake-scrollbar-h .thumb {',
                ' position: absolute; background-color: rgba(120, 120, 120, 0.6);',
                ' border-radius: 4px; cursor: pointer;',
                '}',
                '#custom-fake-scrollbar .thumb { right: 0; width: 6px; transition: background-color 0.2s, width 0.2s; }',
                '#custom-fake-scrollbar-h .thumb { bottom: 0; height: 6px; transition: background-color 0.2s, height 0.2s; }',
                '/* 滑块悬停与拖拽加粗样式 */',
                '#custom-fake-scrollbar .thumb:hover, #custom-fake-scrollbar.dragging .thumb {',
                ' background-color: rgba(120, 120, 120, 0.9); width: 8px !important;',
                '}',
                '#custom-fake-scrollbar-h .thumb:hover, #custom-fake-scrollbar-h.dragging .thumb {',
                ' background-color: rgba(120, 120, 120, 0.9); height: 8px !important;',
                '}',
                '/* 快速编辑设置修正 */',
                '.oo-ui-window-frame { max-height: 400px !important; }',
                '.oo-ui-window-content { height: 400px; }',
                '/* 工具图标CSS定制 */',
                '#ipe-edit-toolbox { will-change: transform; }',
                '#ipe-edit-toolbox.is-resetting { transition: transform 0.2s ease-out; }',
                '#ipe-edit-toolbox #toolbox-toggler {',
                ' opacity: 0.3; transition: opacity 0.3s ease; z-index: 10; cursor: default;',
                '}',
                '#ipe-edit-toolbox #toolbox-toggler:hover,',
                '#ipe-edit-toolbox.is-persistent #toolbox-toggler,',
                '#ipe-edit-toolbox .btn-group:hover ~ #toolbox-toggler { opacity: 1; }',
                '#ipe-edit-toolbox.is-persistent #toolbox-toggler::before { transform: rotate(-45deg); transform-origin: 30px 34px; }',
                "#ipe-edit-toolbox #toolbox-toggler::before {",
                " content: ''; position: absolute;",
                " top: -10px; left: -6px; right: 0; bottom: 0;",
                " clip-path: polygon(0% 0%, 0% 100%, 100% 100%, 100% 0%, 12px 0%, 12px calc(100% - 41px), 0% calc(100% - 41px), 0% 0%);",
                " background: 0;",
                "}"
            ].join('\\n');
            const styleTag = document.createElement('style');
            styleTag.textContent = customCSS;
            document.head.appendChild(styleTag);

            // 延迟隐藏不需要的元素
            (function hideSnsInfo(attempts) {
                let el = document.querySelector('.bui-sns-info');
                if (el) {
                    el.style.setProperty('display', 'none', 'important');
                    el.style.setProperty('visibility', 'hidden', 'important');
                    return;
                }
                if (attempts > 50) { return; }
                setTimeout(function() { hideSnsInfo(attempts + 1); }, 100);
            })(0);

            // 2. 初始化假滚动条 DOM 与逻辑
            const EDGE_THRESHOLD = 40; // 鼠标靠近边缘的触发距离（像素）
            let hideTimer = null;
            let isDraggingV = false;
            let isDraggingH = false;

            // 创建垂直滚动条
            const fakeScrollbarV = document.createElement('div');
            fakeScrollbarV.id = 'custom-fake-scrollbar';
            fakeScrollbarV.innerHTML = '<div class="thumb"></div>';
            document.body.appendChild(fakeScrollbarV);
            const thumbV = fakeScrollbarV.querySelector('.thumb');

            // 创建水平滚动条
            const fakeScrollbarH = document.createElement('div');
            fakeScrollbarH.id = 'custom-fake-scrollbar-h';
            fakeScrollbarH.innerHTML = '<div class="thumb"></div>';
            document.body.appendChild(fakeScrollbarH);
            const thumbH = fakeScrollbarH.querySelector('.thumb');

            // 统一显示滚动条函数
            function showScrollbars() {
                fakeScrollbarV.classList.add('visible');
                fakeScrollbarH.classList.add('visible');
                updateThumbVPosition();
                updateThumbHPosition();

                if (hideTimer) clearTimeout(hideTimer);
                hideTimer = setTimeout(function() {
                    // 如果不在拖拽状态，则隐藏
                    if (!isDraggingV && !isDraggingH) {
                        fakeScrollbarV.classList.remove('visible');
                        fakeScrollbarH.classList.remove('visible');
                    }
                }, 800);
            }

            // 更新垂直滑块位置
            function updateThumbVPosition() {
                let docHeight = document.documentElement.scrollHeight;
                let winHeight = window.innerHeight;
                let scrollTop = window.scrollY || document.documentElement.scrollTop;
                if (docHeight <= winHeight) { thumbV.style.height = '0px'; return; }
                let thumbHeight = Math.max(30, (winHeight / docHeight) * winHeight);
                let thumbTop = (scrollTop / (docHeight - winHeight)) * (winHeight - thumbHeight);
                thumbV.style.height = thumbHeight + 'px';
                thumbV.style.transform = 'translateY(' + thumbTop + 'px)';
            }

            // 更新水平滑块位置
            function updateThumbHPosition() {
                let docWidth = document.documentElement.scrollWidth;
                let winWidth = window.innerWidth;
                let scrollLeft = window.scrollX || document.documentElement.scrollLeft;
                if (docWidth <= winWidth) { thumbH.style.width = '0px'; return; }
                let thumbWidth = Math.max(30, (winWidth / docWidth) * winWidth);
                let thumbLeft = (scrollLeft / (docWidth - winWidth)) * (winWidth - thumbWidth);
                thumbH.style.width = thumbWidth + 'px';
                thumbH.style.transform = 'translateX(' + thumbLeft + 'px)';
            }

            // 监听滚动与窗口大小变化
            window.addEventListener('scroll', showScrollbars, { passive: true });
            window.addEventListener('resize', function() {
                updateThumbVPosition();
                updateThumbHPosition();
            });

            // 监听鼠标移动，仅在靠近边缘时显示
            window.addEventListener('mousemove', function(e) {
                let winWidth = window.innerWidth;
                let winHeight = window.innerHeight;
                let docHeight = document.documentElement.scrollHeight;
                let docWidth = document.documentElement.scrollWidth;

                let isNearRightEdge = e.clientX >= winWidth - EDGE_THRESHOLD;
                let isNearBottomEdge = e.clientY >= winHeight - EDGE_THRESHOLD;
                if (isNearRightEdge || isNearBottomEdge) {
                    showScrollbars();
                } else {
                    // 如果鼠标不在边缘，且当前没有在拖拽任何一个滚动条，才执行隐藏逻辑
                    if (!isDraggingV && !isDraggingH) {
                        clearTimeout(hideTimer);
                        hideTimer = null;
                        fakeScrollbarV.classList.remove('visible');
                        fakeScrollbarH.classList.remove('visible');
                    }
                }

                // 处理垂直拖拽
                if (isDraggingV) {
                    e.preventDefault();
                    let deltaY = e.clientY - dragStartPos;
                    let thumbHeight = thumbV.offsetHeight;
                    let trackHeight = winHeight - thumbHeight;
                    let scrollableHeight = docHeight - winHeight;
                    let ratio = scrollableHeight / trackHeight;
                    let targetScrollTop = dragScrollStart + (deltaY * ratio);
                    targetScrollTop = Math.max(0, Math.min(targetScrollTop, scrollableHeight));
                    window.scrollTo({ top: targetScrollTop });
                }
                // 处理水平拖拽
                if (isDraggingH) {
                    e.preventDefault();
                    let deltaX = e.clientX - dragStartPos;
                    let thumbWidth = thumbH.offsetWidth;
                    let trackWidth = winWidth - thumbWidth;
                    let scrollableWidth = docWidth - winWidth;
                    let ratio = scrollableWidth / trackWidth;
                    let targetScrollLeft = dragScrollStart + (deltaX * ratio);
                    targetScrollLeft = Math.max(0, Math.min(targetScrollLeft, scrollableWidth));
                    window.scrollTo({ left: targetScrollLeft });
                }
            });

            // 3. 拖拽逻辑
            let dragStartPos = 0;
            let dragScrollStart = 0;

            // 垂直拖拽
            thumbV.addEventListener('mousedown', function(e) {
                isDraggingV = true;
                fakeScrollbarV.classList.add('dragging');
                dragStartPos = e.clientY;
                dragScrollStart = window.scrollY || document.documentElement.scrollTop;
                e.preventDefault();
            });

            // 水平拖拽
            thumbH.addEventListener('mousedown', function(e) {
                isDraggingH = true;
                fakeScrollbarH.classList.add('dragging');
                dragStartPos = e.clientX;
                dragScrollStart = window.scrollX || document.documentElement.scrollLeft;
                e.preventDefault();
            });

            window.addEventListener('mouseup', function() {
                if (isDraggingV || isDraggingH) {
                    isDraggingV = false;
                    isDraggingH = false;
                    fakeScrollbarV.classList.remove('dragging');
                    fakeScrollbarH.classList.remove('dragging');
                    // 鼠标松开后，延迟隐藏
                    hideTimer = setTimeout(function() {
                        fakeScrollbarV.classList.remove('visible');
                        fakeScrollbarH.classList.remove('visible');
                    }, 800);
                }
            });

            // 鼠标移出窗口时清理拖拽状态，防止永远卡死
            document.addEventListener('mouseleave', function() {
                if (isDraggingV || isDraggingH) {
                    isDraggingV = false;
                    isDraggingH = false;
                    fakeScrollbarV.classList.remove('dragging');
                    fakeScrollbarH.classList.remove('dragging');
                    hideTimer = setTimeout(function() {
                        fakeScrollbarV.classList.remove('visible');
                        fakeScrollbarH.classList.remove('visible');
                    }, 800);
                }
            });

            // 4. 特殊页面样式
            const targetHost = 'wiki.biligame.com';
            const targetPaths = ['/ys', '/zzz'];
            const currentHost = window.location.hostname;
            const currentPath = window.location.pathname;
            if (currentHost === targetHost && targetPaths.some(function(p) { return currentPath.startsWith(p); })) {
                const s = document.createElement('style');
                s.textContent = 'a:focus:not(:focus-visible) { outline-style: none; }';
                document.head.appendChild(s);
            }

            // 5. 加载 InPageEdit 核心模块
            const script = document.createElement('script');
            script.src = 'https://cdn.jsdelivr.net/npm/@inpageedit/core/dist/index.js';
            script.type = 'module';
            document.head.appendChild(script);

            // 6. 图标拖拽 + 记忆 + 归位
            const observer = new MutationObserver(function() {
                const toolbox = document.getElementById('ipe-edit-toolbox');
                const handle = document.getElementById('toolbox-toggler');
                if (toolbox && handle && !handle.dataset.dragInit) {
                    handle.dataset.dragInit = 'true';
                    initSafeDrag(toolbox, handle);
                }
            });
            observer.observe(document.body, { childList: true, subtree: true });

            function initSafeDrag(targetElement, dragHandle) {
                let isDragging = false, hasMoved = false;
                let startX, startY, rafId = null;
                let currentTranslateX = 0, currentTranslateY = 0;
                const DRAG_THRESHOLD = 3;

                // 读取保存的位置
                const savedPos = localStorage.getItem(STORAGE_KEY);
                if (savedPos) {
                    try {
                        const pos = JSON.parse(savedPos);
                        currentTranslateX = pos.x;
                        currentTranslateY = pos.y;
                        targetElement.style.transform = 'translate(' + currentTranslateX + 'px,' + currentTranslateY + 'px)';
                    } catch (e) { console.error('IPE位置读取失败', e); }
                }

                // 归位执行函数（双击 & 菜单共用）
                function doReset() {
                    targetElement.classList.add('is-resetting');
                    currentTranslateX = 0;
                    currentTranslateY = 0;
                    targetElement.style.transform = 'translate(0px,0px)';
                    localStorage.removeItem(STORAGE_KEY);
                    setTimeout(function() { targetElement.classList.remove('is-resetting'); }, 250);
                }

                // 监听来自沙箱层的菜单归位指令
                window.addEventListener('message', function(e) {
                    if (e.data && e.data.type === 'IPE_RESET_POSITION') doReset();
                });

                // 双击按钮归位
                dragHandle.addEventListener('dblclick', function(e) {
                    e.preventDefault();
                    e.stopPropagation();
                    doReset();
                });

                // 拖拽开始
                dragHandle.addEventListener('mousedown', function(e) {
                    if (e.button !== 0) return;
                    isDragging = true;
                    hasMoved = false;
                    startX = e.clientX - currentTranslateX;
                    startY = e.clientY - currentTranslateY;
                    targetElement.classList.remove('is-resetting');
                    e.preventDefault();
                });

                // 拖拽中
                const onMouseMove = function(e) {
                    if (!isDragging) return;
                    let dx = e.clientX - startX, dy = e.clientY - startY;
                    if (!hasMoved && Math.sqrt(dx*dx + dy*dy) > DRAG_THRESHOLD) {
                        hasMoved = true;
                        targetElement.style.pointerEvents = 'none';
                    }
                    if (hasMoved) {
                        e.preventDefault();
                        currentTranslateX = dx;
                        currentTranslateY = dy;
                        if (rafId) cancelAnimationFrame(rafId);
                        rafId = requestAnimationFrame(function() {
                            targetElement.style.transform = 'translate(' + currentTranslateX + 'px,' + currentTranslateY + 'px)';
                        });
                    }
                };

                // 拖拽结束
                const onMouseUp = function() {
                    if (isDragging) {
                        if (hasMoved) {
                            targetElement.style.pointerEvents = '';
                            localStorage.setItem(STORAGE_KEY, JSON.stringify({ x: currentTranslateX, y: currentTranslateY }));
                        }
                        isDragging = false;
                        if (rafId) cancelAnimationFrame(rafId);
                    }
                };

                window.addEventListener('mousemove', onMouseMove);
                window.addEventListener('mouseup', onMouseUp);
            }
        });

            // 7. 窗口英文翻译模块（首选项未翻译，需穿透Shadow）
            (function() {
                const dictionaries = {
                    '.quick-diff': {
                        'Quick edit': '快速编辑',
                        'talk': '讨论',
                        'contribs': '贡献',
                        'block': '封禁',
                        'Newest version': '最新版本',
                        '← Previous': '← 上一编辑',
                        'Next →': '下一编辑 →',
                        'Oldest version': '最早版本',
                        'Original Compare Page': '原比较页'
                    },
                    '.size--dialog': {
                        'Edit any page': '编辑任意页',
                        'OK': '确定',
                        'Cancel': '取消'
                    },
                    '#ipe-toolbox__edit-any-page': {
                        'Edit any page': '编辑任意页'
                    },
                    '.ipe-quickUpload': {
                        'No files selected.': '未选择文件',
                        'Files': '文件',
                        'You can drag & drop files to this modal': '您可以将文件拖放到此弹窗中',
                        'Summary (applies to all files)': '摘要（适用于所有文件）',
                        'Reset': '重置',
                        'Target filename': '目标文件名',
                        'File description': '文件描述',
                        'Queued': '排队',
                        'Uploaded': '已上传',
                        'Warning': '警告',
                        'A file with the same name already exists.': '已存在同名文件。',
                        'Failed':'失败',
                        'Upload failed with unknown error.':'因未知错误上传失败。',
                        'Retry failed/warnings': '重试失败/警告',
                        'Open file page':'打开文件页',
                        'Open file URL':' '
                    }
                };

                // 开关状态（默认开启，等待沙箱层同步）
                let isTranslateEnabled = true;
                let isPreventMaskEnabled = true;
                document.addEventListener('DOMContentLoaded', () => {
                    window.postMessage({ type: 'IPE_REQUEST_INITIAL_STATE' }, '*');
                });
                // 监听来自沙箱层的菜单开关指令
                window.addEventListener('message', function(e) {
                    if (!e.data || !e.data.type) return;
                    if (e.data.type === 'IPE_TRANSLATE_TOGGLE') {
                        isTranslateEnabled = e.data.enabled;
                    }
                    if (e.data.type === 'IPE_PREVENT_MASK_TOGGLE') {
                        isPreventMaskEnabled = e.data.enabled;
                    }
                });

                //阻止点击外部区域关闭编辑器（解决插件不同步首选项）
                const preventEvents = ['mouseup', 'pointerup', 'touchend'];
                preventEvents.forEach(function(eventName) {
                    document.addEventListener(eventName, function(e) {
                        // 检查点击目标是否为遮罩层
                        if (e.target && e.target.classList.contains('ipe-modal-backdrop')) {
                            if (isPreventMaskEnabled) {
                                e.stopPropagation();
                                e.preventDefault();
                            }
                        }
                    }, true);
                });

                let timer = null;
                function translate() {
                    if (!isTranslateEnabled) return;
                    // 遍历所有配置了字典的窗口类名
                    for (const selector in dictionaries) {
                        if (!dictionaries.hasOwnProperty(selector)) continue;
                        const windows = document.querySelectorAll(selector);
                        if (!windows.length) continue;
                        const dict = dictionaries[selector];
                        for (let i = 0; i < windows.length; i++) {
                            const walker = document.createTreeWalker(
                                windows[i], NodeFilter.SHOW_TEXT, null, false
                            );
                            let node;
                            while (node = walker.nextNode()) {
                                const t = node.textContent.trim();
                                if (dict.hasOwnProperty(t)) {
                                    node.textContent = dict[t];
                                }
                            }
                        }
                    }
                }

                const observer = new MutationObserver(function() {
                    if (timer) clearTimeout(timer);
                    timer = setTimeout(function() {
                        translate();
                    }, 0);
                });
                observer.observe(document.body, { childList: true, subtree: true, characterData: true });
            })();

    })();`;
    document.head.appendChild(pageScript);
})();
