import { defineCampaign } from 'mediakit';

export default defineCampaign({
  id: 'daybook',
  outputs: ['instagram-portrait', 'linkedin-document', 'app-store-iphone', 'readme-card'],
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
    {
      layout: 'text-only',
      headline: 'Make space for\nwhat matters.',
      body: 'A quieter place for tasks, plans,\nand the ideas worth keeping.',
    },
  ],
});
