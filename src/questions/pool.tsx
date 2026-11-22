export type Skill = "writing" | "speaking";
export type SetId = 1 | 2;

export const taskTitles = {
  writing: ["Writing an Email", "Responding to Survey Questions"],
  speaking: [
    "Giving Advice",
    "Talking about a Personal Experience",
    "Describing a Scene",
    "Making Predictions",
    "Comparing and Persuading",
    "Dealing with a Difficult Situation",
    "Expressing Opinions",
    "Describing an Unusual Situation",
  ],
};

export const writingSeconds = [27 * 60, 26 * 60];
export const speakingTimes = [
  { preparation: 30, response: 90 },
  { preparation: 30, response: 60 },
  { preparation: 30, response: 60 },
  { preparation: 30, response: 60 },
  { selection: 60, preparation: 60, response: 60 },
  { preparation: 60, response: 60 },
  { preparation: 30, response: 90 },
  { preparation: 30, response: 60 },
];

export interface Illustration {
  file: string;
  alt: string;
}

export interface Option {
  title: string;
  details: string[];
  image: Illustration;
}

export interface Prompt {
  context: string;
  instruction: string;
  points?: string[];
  image?: Illustration;
  comparison?: {
    choices: [Option, Option];
    alternative: Option;
    instruction: string;
  };
}

const market: Illustration = {
  file: "farmers-market.webp",
  alt: "At an outdoor market, a vendor serves a customer, a cyclist waits near a stall, oranges fall near a child, and a dog sniffs a shopping bag.",
};

const recreation: Illustration = {
  file: "recreation-centre.webp",
  alt: "In a recreation centre lobby, visitors arrive while people move chairs and basketballs and read a noticeboard.",
};

function option(title: string, details: string[], file: string): Option {
  return { title, details, image: { file, alt: title } };
}

const sets: Record<SetId, Record<Skill, Prompt[]>> = {
  1: {
    writing: [
      {
        context: "Your neighbourhood recreation centre changed the hours of its evening classes. You can no longer attend the class you signed up for after work.",
        instruction: "Write an email to the recreation centre manager in about 150–200 words.",
        points: [
          "Explain which class you signed up for and why you chose it.",
          "Describe how the schedule change affects you.",
          "Suggest a solution and ask the manager to respond.",
        ],
      },
      {
        context: "Your building has a small unused room. The management committee is asking residents how the room should be used.",
        instruction: "Choose the option you prefer and explain your reasons in about 150–200 words.",
        points: [
          "Option A — Turn the room into a quiet shared workspace with desks and Wi-Fi.",
          "Option B — Turn the room into a tool-lending room where residents can borrow equipment.",
        ],
      },
    ],
    speaking: [
      {
        context: "Your friend is moving to a new city for work and does not know anyone there.",
        instruction: "Give your friend advice on meeting people and feeling at home during the first month.",
      },
      {
        context: "Think about a time when you helped someone solve a problem.",
        instruction: "Describe the situation, explain what you did and say what you learned from the experience.",
      },
      {
        context: "Your friend cannot see the picture of the farmers’ market.",
        instruction: "Describe what is happening in the picture so your friend can imagine the scene.",
        image: market,
      },
      {
        context: "Look at the same farmers’ market scene.",
        instruction: "What do you think will happen next? Use details from the picture to support your predictions.",
        image: market,
      },
      {
        context: "You and your cousin need a shelter for a weekend camping trip.",
        instruction: "Choose which of these two options you would take.",
        comparison: {
          choices: [
            option("Compact dome tent", ["$85", "Sleeps two adults", "Easy to carry and quick to set up"], "compact-tent.webp"),
            option("Cabin tent", ["$140", "Sleeps four adults", "Room to stand up and store bags"], "cabin-tent.webp"),
          ],
          alternative: option("Rain tarp", ["$55", "Open sides", "Can also cover a picnic table"], "rain-tarp.webp"),
          instruction: "Your cousin suggests taking a rain tarp. Speak to your cousin and explain why your original choice is more suitable for the trip.",
        },
      },
      {
        context: "You promised to help your brother move on Saturday. Your supervisor has asked you to cover an unexpected shift at the same time.",
        instruction: "Choose one person to speak to.",
        points: [
          "Speak to your brother and explain why you cannot help at the original time.",
          "Speak to your supervisor and explain why you cannot take the shift.",
        ],
      },
      {
        context: "Some municipalities offer free public transit on weekends.",
        instruction: "Do you think your municipality should do this? Explain your position and support it with specific reasons.",
      },
      {
        context: "You are at a fair and see an unusual device that would be fun to bring to an event. Your friend is organizing that event.",
        instruction: "Call your friend. Describe what the device looks like and explain how people might use it.",
        image: {
          file: "smoothie-bike.webp",
          alt: "A stationary bicycle powers a clear blender jar full of fruit at a community fair.",
        },
      },
    ],
  },
  2: {
    writing: [
      {
        context: "Several people in your apartment building have received parcels at the wrong unit. You recently found one of your own deliveries on a different floor.",
        instruction: "Write an email to the building manager in about 150–200 words.",
        points: [
          "Describe what happened to your delivery.",
          "Explain why the issue matters to residents.",
          "Suggest how the building could improve parcel delivery.",
        ],
      },
      {
        context: "Your town has funding for one new community service and wants residents to choose between two proposals.",
        instruction: "Choose the option you would support and explain your reasons in about 150–200 words.",
        points: [
          "Option A — Run a weekly mobile library that visits different neighbourhoods.",
          "Option B — Extend evening and weekend hours at the main library.",
        ],
      },
    ],
    speaking: [
      {
        context: "Your coworker would like to cycle to work but has never ridden in busy traffic.",
        instruction: "Give your coworker practical advice on getting started and building confidence.",
      },
      {
        context: "Think about a time when you had to change your plans unexpectedly.",
        instruction: "Explain what you had planned, what changed and how you handled the situation.",
      },
      {
        context: "Your friend cannot see the picture of the recreation centre.",
        instruction: "Describe what is happening in the picture so your friend can imagine the scene.",
        image: recreation,
      },
      {
        context: "Look at the same recreation centre scene.",
        instruction: "Explain what you think will happen next and what details in the picture led you to those predictions.",
        image: recreation,
      },
      {
        context: "You and your roommate want to buy something you can share for short errands around town.",
        instruction: "Choose which of these two options suits you better.",
        comparison: {
          choices: [
            option("City bicycle", ["$320", "Front basket for groceries", "Light enough to carry upstairs"], "city-bike.webp"),
            option("Electric bicycle", ["$850", "Motor assists on hills", "Battery takes four hours to charge"], "electric-bike.webp"),
          ],
          alternative: option("Kick scooter", ["$180", "Folds for storage", "Designed for short trips on smooth paths"], "kick-scooter.webp"),
          instruction: "Your roommate suggests a kick scooter. Speak to your roommate and compare it with the option you picked, explaining why your choice suits your errands.",
        },
      },
      {
        context: "Your neighbours asked you to watch their dog for a week. Another housemate says the apartment will be too noisy while they work from home.",
        instruction: "Choose one person to speak to.",
        points: [
          "Speak to your neighbours and explain why you cannot watch their dog at your apartment.",
          "Speak to your housemate and propose a way to care for the dog while respecting their work schedule.",
        ],
      },
      {
        context: "A local employer is considering a paid afternoon off every month for staff to volunteer in the community.",
        instruction: "Do you think employers should offer this benefit? Explain your position with specific reasons.",
      },
      {
        context: "You see a strange piece of rain gear at a market. A friend has been looking for something to wear while walking the dog after dark.",
        instruction: "Call your friend. Describe what you see and explain how it might help on a rainy walk.",
        image: {
          file: "umbrella-hat.webp",
          alt: "A red umbrella hat with an attached yellow light and transparent visor on a mannequin head.",
        },
      },
    ],
  },
};

export function getPrompt(skill: Skill, set: SetId, task: number): Prompt {
  return sets[set][skill][task - 1];
}
