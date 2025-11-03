import LanguageSwitcher from './LanguageSwitcher';

export default {
  title: 'Components/LanguageSwitcher',
  component: LanguageSwitcher,
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: { type: 'select' },
      options: ['icon', 'chip'],
      description: 'Visual variant of the language switcher',
    },
    size: {
      control: { type: 'select' },
      options: ['small', 'medium', 'large'],
      description: 'Size of the component',
    },
  },
};

export const IconVariant = {
  args: {
    variant: 'icon',
    size: 'medium',
  },
};

export const ChipVariant = {
  args: {
    variant: 'chip',
    size: 'medium',
  },
};

export const SmallSize = {
  args: {
    variant: 'icon',
    size: 'small',
  },
};

export const LargeSize = {
  args: {
    variant: 'icon',
    size: 'large',
  },
};

export const Interactive = {
  args: {
    variant: 'icon',
    size: 'medium',
  },
  play: async ({ canvasElement }) => {
    // This would be used with Storybook interactions addon
    // to demonstrate interactive behavior
  },
};
