import { createApp } from 'vue'
import { registerStyle } from '@et4proj/liquid-glass-core'
import { ios26 } from '@et4proj/liquid-glass-style-ios26'
import { ios27 } from '@et4proj/liquid-glass-style-ios27'
import App from './App.vue'
import './style.css'

// token v2：core 零风格数据，风格包统一在此注册（ios27 为主要方向）
registerStyle(ios26)
registerStyle(ios27)

createApp(App).mount('#app')
