import { mount } from '@vue/test-utils';
import { describe, expect, it } from '@jest/globals';
import Home from '@/views/Home.vue';

describe('Home.vue', () => {
    it('renders home vue', () => {
        const wrapper = mount(Home);
        expect(wrapper.text()).toMatch('Home Page');
    });
});