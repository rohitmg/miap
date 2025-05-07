import './bootstrap';
import { createApp } from 'vue/dist/vue.esm-bundler.js'; // Change this line
import { createPinia } from 'pinia';
import router from './router.js';

// Create Vue app
const app = createApp({});

// Setup Pinia
app.use(createPinia());

// Setup Vue Router
app.use(router);

// Mount the app
app.mount('#app');