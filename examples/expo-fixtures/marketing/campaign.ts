import { defineCampaign } from 'mediakit';

export default defineCampaign({
  id: 'daybook-ios',
  outputs: ['app-store-iphone'],
  slides: [
    {
      layout: 'headline-above-device',
      headline: 'A little less scattered.',
      body: 'Your day, with room to breathe.',
      screen: 'dashboard',
      device: 'iphone',
    },
    {
      layout: 'headline-above-device',
      headline: 'Small steps add up.',
      body: 'See the progress you made.',
      screen: 'dashboard',
      fixture: 'afternoon',
      device: 'iphone',
    },
  ],
});
