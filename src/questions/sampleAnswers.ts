import type { SetId, Skill } from "./pool";

type Sample = string | [string, string];

const samples: Record<SetId, Record<Skill, Sample[]>> = {
  1: {
    writing: [
      `Dear Recreation Centre Manager,

I signed up for the Wednesday evening swimming class because it was the only beginner session I could reach after work. I want to feel confident taking my daughter to the pool this summer, and the first two lessons have already made a difference.

Yesterday I received a message saying the class would start at five instead of seven. My shift at the pharmacy ends at five thirty. Even if I went straight to the pool, I would miss the entire lesson. My colleague can cover one shift for me, but she cannot do that every Wednesday for the rest of the course.

Would it be possible to transfer my registration to the Saturday morning group? I would be happy to join a waiting list if that class is full. In the meantime, could you let me know whether I can make up this week's lesson during an open practice session?

Thank you for your help,
Alex Chen`,
      `I would use the spare room as a tool library. Last weekend I bought a drill to put up two shelves. The job took ten minutes, and the drill has occupied most of a kitchen drawer ever since. I suspect there are dozens of tools in our building that get just as little use.

A lending room would save residents money and make small repairs easier. Someone who notices a loose cupboard door on Sunday could borrow a screwdriver downstairs and fix it before the hinge comes off. It would be especially helpful for new tenants who have spent their moving budget on essentials.

I suggest starting with a locked cabinet, a small collection of hand tools and a sign-out sheet. The committee could check the sheet after three months to see which items are worth buying. A workspace would benefit residents who work from home, but tools are something almost every household needs occasionally.`,
    ],
    speaking: [
      "When I moved, Sundays were the hardest because I had a whole day free and nobody to call. I'd pick one thing you already enjoy and put it on your calendar every week. You love cooking, so why not try the Thursday class at the community centre? The second time you go, you'll already know a few names. At work, ask the person beside you where they go for lunch and invite them to join you. Even if they're busy, you'll have a new place to try. Give yourself a month to get comfortable. Having one person wave at you on your way home can make a new city feel surprisingly familiar.",
      "Last winter my neighbour called me from the bus station. Her bus had been cancelled, and she was worried she'd miss her grandson's concert. I asked her to send me a photo of the departures board. There was a bus to the next town in ten minutes, so I called her daughter, who agreed to collect her there. She made it just as the children were walking onstage. I learned to ask what someone actually needs before trying to solve the problem. She didn't need to reach her original station. She just wanted to hear her grandson sing.",
      "Picture an outdoor market on a busy morning. At one stall a vendor is helping a customer, and a cyclist has stopped nearby. What caught my eye was the fruit. Some oranges are tumbling down near a child, so there's a little burst of activity right beside people who are still doing their shopping. There's also a dog with its nose right up against a shopping bag. The people seem occupied with the stalls, while the dog is doing its own investigation down at ground level.",
      "I think someone will have to stop those oranges before they roll under the stalls. The child is close enough to reach one, so I can imagine them picking it up and handing it back. The cyclist nearby will probably wait a moment rather than try to get through while people are bending down. I'd also keep an eye on that shopping bag. The dog is already sniffing it, and if there's food inside, the owner may need to lift the bag out of reach. In a minute the vendor will probably be back to serving customers.",
      [
        "I'd take the compact dome tent. I know the tarp saves us thirty dollars, but imagine getting to camp tired and having the wind blow rain across our sleeping bags. The tarp has open sides. With the tent we can zip the door and get some sleep. It fits the two of us, and it's light enough to carry from the bus stop. Since it goes up quickly, we could have it ready before dark even if our bus is late. Shall we split the cost?",
        "I'd go for the cabin tent. I know the tarp is cheaper, and it would be handy over a picnic table. What worries me is where we'd put our bags overnight if the rain started blowing sideways. The cabin tent sleeps four, so the two of us would have room to keep our gear inside and change into dry clothes standing up. We could also lend it to your family later this summer. I'd be happy to pay a little more for those two dry nights.",
      ],
      "Hi Sam, I got your message about the Saturday shift. I promised my brother I'd help him move that morning. He has to return the rental truck by noon, and some of his furniture takes two people to lift. I can come in after lunch if that would help. I could also take the Sunday opening shift if someone on that team is willing to swap. Would either arrangement cover the busiest hours? I wanted to call now so you still have time to arrange the morning.",
      "I'd like our town to try free weekend transit, especially on the route to the waterfront. Last Saturday my sister drove her three kids there because four return fares would have cost more than parking. They spent twenty minutes circling the block. If that bus were free, families like hers could leave the car at home and spend the savings at a local shop. I'd start with a summer trial and count riders on each route. If the buses fill up, the town should add service where people are getting left behind. A free ride is only useful if you can actually get on.",
      "Hey Maya, I've found something for your fair. It looks like an exercise bike, except there's a clear blender jug full of fruit attached to it. The rider turns the pedals and the blades spin. You can actually see the fruit breaking up as the rider gets going. Imagine putting it beside the snack table. Guests could choose their fruit, pedal for a minute and pour themselves a smoothie. Could you make room for it? I'll ask the person running the stall how we'd clean the jug between turns.",
    ],
  },
  2: {
    writing: [
      `Dear Building Manager,

On Tuesday I received a delivery notification for a parcel containing a birthday gift. The photo showed a familiar welcome mat, but when I opened my door, the hallway was empty. A neighbour eventually found the box outside unit 604. I live in unit 406, and the correct number was printed on the label.

I was fortunate that the neighbour recognized my name. Another resident might be waiting for something they need the same afternoon, and a heavy parcel on the wrong doorstep could also block someone from getting out safely.

Could we put a clearly marked delivery shelf beside the front desk? A driver could leave each parcel with the concierge, who could then send a short message to the recipient. For deliveries outside desk hours, a large floor number opposite each lift would help drivers check where they are before leaving a box. I would be happy to share the delivery photo if that helps you follow up with the courier.

Kind regards,
Jordan Lee`,
      `I would put the funding toward a weekly mobile library. The main branch has a good children's collection, but for families in the north end, visiting it can mean taking two buses in each direction. Extending the opening hours would still leave those families with the same long journey.

A mobile service could stop outside the school just before dismissal. Parents could pick up reserved books while waiting for their children, and students could return last week's books on their way home. A second stop near the seniors' apartments would reach readers who find it difficult to get to the bus stop in winter.

The mobile shelves would hold fewer titles than the main branch, so I would let people reserve books by phone as well as online. Staff could pack those requests before each trip. A reliable weekly visit with the books people have asked for would make the library part of many more residents' routines.`,
    ],
    speaking: [
      "I'd start by trying the trip on Sunday morning, when there's less traffic and you have time to stop. There's a bike lane along the river. It's a bit longer than the main road, but you can get used to the turns without a bus right behind you. Take a look at where the lane ends so that junction feels familiar on Monday. How about riding in together the first day? We could leave early and walk the bikes across the busiest intersection. After a few trips you'll know which parts feel comfortable and where you'd like more practice.",
      "I was supposed to host my sister's birthday dinner last February. About an hour before everyone arrived, the power went out with the lasagna still in the oven. My neighbour had power, but her oven was too small for the pan. I called my sister and asked her to meet us at the bakery near the station. Everyone brought one thing, and the baker let us put candles in a cinnamon bun. My sister still talks about that bun. I learned that what mattered to her was having us all around one table.",
      "It's a recreation centre lobby, and several things are happening at once. Some visitors are just arriving, while other people have stopped at the noticeboard to read what's on. Nearby, people are moving chairs, and there are basketballs being carried through the lobby too. If you walked in right now, you'd probably have to pause to let someone pass with a chair. It feels like that moment just before a community event starts, when some people are finding their way and others are getting everything ready.",
      "My guess is that an activity is about to start. People are moving chairs, so I think they'll put them in rows or along a wall where visitors can sit. The people with the basketballs are probably heading for the gym. Once one group starts moving in that direction, some of the new arrivals may follow them. I think the visitors at the noticeboard will stay behind for a moment to check a room number or a start time. Then the lobby should get a little quieter as everyone finds the right place.",
      [
        "I'd pick the city bicycle for our errands. The scooter would fold neatly in our hall, but picture yourself coming back from the market with a bag of potatoes. On the bike you can put that bag in the front basket and keep both hands on the handlebars. It's light enough for either of us to carry upstairs, too. It costs a hundred and forty dollars more than the scooter. If we split that difference, I think seventy dollars each is worth it for something we'll use for groceries every week.",
        "I'd choose the electric bicycle. I can see why you like the scooter. It's cheaper and we could fold it away by the door. But think about the hill between our place and the shops. Coming home after work, I'd really appreciate the motor helping me up that last stretch. The battery charges in four hours, so we could plug it in after dinner and have it ready for the morning. It is a bigger purchase. Could we try one on the hill together before we decide?",
      ],
      "Hi Jo, I wanted to talk about next week while you still have time to plan. My housemate works from home and spends most mornings on calls. Your dog gets excited when someone comes to the door, so having him here during those calls would be tricky. Could I look after him at your place instead? I could stay overnight and take him on his usual morning walk before work. That way he'd have his own bed and a familiar routine. Let me know if you'd be comfortable giving me a spare key.",
      "Yes, I'd welcome a paid afternoon to volunteer each month. The food bank near my office needs people to sort deliveries on weekday afternoons, exactly when most of us are at work. Even two colleagues going regularly could take a whole delivery off the coordinator's hands. I'd let staff choose their own organizations and stagger their afternoons so someone is always available for customers. A colleague who cares for a parent might prefer to spend that time helping at a seniors' centre. Giving people a choice would make them more likely to keep showing up after the first month.",
      "Hi Ben, remember how awkward it was to hold an umbrella and the dog's lead last night? I'm looking at a bright red umbrella that you wear on your head. There's a clear visor in front of your face and a little yellow light attached to the top. It looks funny on the mannequin, but you'd have both hands free to shorten the lead or pick up after the dog. You could see through the visor when the rain was blowing toward you, and the light might help other walkers spot you on the path.",
    ],
  },
};

export function getSampleAnswer(skill: Skill, set: SetId, task: number, choice = 0) {
  const sample = samples[set][skill][task - 1];
  return Array.isArray(sample) ? sample[choice] ?? sample[0] : sample;
}
