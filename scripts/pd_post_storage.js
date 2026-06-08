const postSignatures = {
    drawing_pad: "Paddy-V (Founder)"
}

const typeClasses = {
    header: "section-header",
    paragraph: "section-paragraph",
    bulletList: "section-list",
    signature: "section-signature"
}

const typeTemplates = [
    { type: "paragraph", content: "" },
    { type: "bulletList", content: [] },
    { type: "audio", src: "" },
]

const newsPosts = {
    post9: {
        postHeader: "New Career Goals",
        postDate: "3rd of January 2026",
        postBody: [
            { type: "paragraph", content: "Hello again! This is more of a repeat announcement I did in the community server during Christmas, so everyone outside of it can get a glimpse of where the Dreamland is currently going." },
            { type: "paragraph", content: "During October, up until December, I have been hard at work preparing a streaming environment, both hardware and software-related, to stream Dreamland's future development sessions and other miscellaneous activities on Twitch. This allows more fun interactions with the community such as real-time chats, backseating, feedback, suggestions, and so on, instead of just receiving vague development updates in the community server." },
            { type: "paragraph", content: "On the 2nd of January, we did our first test stream, which revealed more technical and workflow issues than what was known before said stream. While we're at it, I'll keep on improving the experience and doing stress tests until everything begins to run smoothly, so we can then finally focus on actual big themes and topics." },
            { type: "paragraph", content: "We'll keep on going and going, come visit us sometime! <a href=\"https://www.twitch.tv/paddysdreamland/about\">We'll be here</a>." },
        ],
        postImages: {},
        postSignature: postSignatures.drawing_pad,
        irrelevant: false
    },
    post8: {
        postHeader: "From Roblox to Source 2",
        postDate: "29th of October 2025",
        postBody: [
            { type: "paragraph", content: "Righty-o, where do I even start? There's been a lot of changes since the last post, they can be viewed as positive, maybe even negative, that's up to you. There's also something else that is good but isn't explicitly related to our community." },
            { type: "paragraph", content: "First things first. A few months ago, I have abandoned the Roblox platform entirely, and I longer wish to develop on said platform, and you probably know the reasons for that. Instead, I am going back to my roots, the Source engine. But not just the Source engine, it's the Source 2 engine in s&box. It's been a few weeks, maybe months, since I picked up s&box and started to explore the editor and engine. So far, it's been fun, and knowing that my future projects will run on the Source 2 engine, it's going to make working on said projects far more enjoyable." },
            { type: "paragraph", content: "It's not just the engine alone, but there are far less limitations and more freedom when it comes to s&box. You've got shader graph which allows you to make your own custom shaders, there's no filtering or moderation at all, and of course, the primary programming language which is C#. Learning said language will also give me big benefits in the real world, compared to Lua." },
            { type: "paragraph", content: "So where does this put Paddy's Dreamland? What about the current projects? Mirror's Edge™ Glass, United Planet, Fragmented Worlds: Source? They're not forgotten, just adapting to a new environment." },
            { type: "paragraph", content: "I've mentioned third-party news at the start, and I'll get to it now. Eric Gurt has launched Plazma Burst 3 in its closed beta stage. If you're interested, you can gain access to the game by becoming a member on their Patreon." },
        ],
        postImages: {},
        postSignature: postSignatures.drawing_pad,
        irrelevant: false
    },
    post7: {
        postHeader: "The Glass Phase",
        postDate: "21st of May 2025",
        postBody: [
            { type: "paragraph", content: "I do apologize for my last announcement, which I had to take down. It was quite disrespectful and published while I was in a bad mood and situation. But on the bright side, I bring some good news. First, let's start with some changes that occurred here:" }, 
            { type: "bulletList", content: [
                "The news section now uses a more dynamic approach. It might be irrelevant to you, but I no longer have to modify the HTML structure of the website just to write a new announcement. It's handled through structured data, and updates dynamically, without causing collateral damage in the process.",
                "Some announcements, that no longer seem relevant, now have a big \"OUTDATED\" label on top of them, while being partially blacked out. I do not intend on deleting old announcements, so if you want to read them, go ahead. I am not stopping you.",
                "Trademark symbol? Yeah, I am considering trademarking the community at some point, or maybe never. Until then, it will be a sign that the community is something great and means a lot to me.",
                "I recently created a new email address which uses the @paddysdreamland.com handle, I find that really cool, but that really shouldn't concern anyone."
            ] },
            { type: "paragraph", content: "Apart from the changes, I'd say that my mental health has mostly stabilized during these couple of months, but I still need some additional checks. Meanwhile, I already made some significant additions to the Glass port in Roblox, also fixed some critical bugs in the math that screwed up the import mechanics in the past. Now it's pretty much just the asset importing that needs pushing, before I start implementing more complex features such as a WorldPartData importer, InstanceObjectVariation, and Blueprint handlers, and so on." },
            { type: "paragraph", content: "And there's more. I did notice that the community isn't as active as it used to be, but I still deeply care about it, it's my safe-space after all. I listened to some suggestions from others on how I could potentially grow the community and get some recognition, and that is publishing the progress of Glass to YouTube, most of it as YouTube shorts. I'll do that soon, if I can, and see what comes out of it." },
            { type: "paragraph", content: "Before I end my announcement wall-of-text streak, I would like to ask for a favor while I continue my work in the background. If you can, do recommend Paddy's Dreamland to other friends or people that may like the environment in this community, I'd be thankful." },
            { type: "paragraph", content: "That's everything from me for now. Until next time!" },
        ],
        postImages: {},
        postSignature: postSignatures.drawing_pad,
        irrelevant: true
    },
    post6: {
        postHeader: "I'm Still Here",
        postDate: "30th of March 2025",
        postBody: [
            { type: "paragraph", content: "You might've noticed the silence. No updates, no progress showcases, nothing new. I haven't vanished — I'm <em>just burnt the fuck out</em>." },
            { type: "paragraph", content: "I was diagnosed with ADHD recently, and the untreated symptoms, mixed with long-term stress and community pressure, completely drained me. That's why I stopped working on projects. That's why I've barely touched this site. That's why the community feels quiet." },
            { type: "paragraph", content: "This isn't laziness. This isn't me giving up. This is recovery. I'm not gone, I'm just healing." },
            { type: "paragraph", content: "There's no return date, and I'm not rushing anything. I'll come back when I'm ready — and when I do, I'll do it right." },
            { type: "paragraph", content: "If you're still here, thank you. If not, I understand." }
        ],
        postImages: {},
        postSignature: postSignatures.drawing_pad,
        irrelevant: true
    },
    post5: {
        postHeader: "Rebrand Completion & Additions",
        postDate: "10th of December 2024",
        postBody: [
            { type: "paragraph", content: "If I took everything into consideration, the rebrand should now be fully complete! Here are the changes that occurred after the last post:" },
            { type: "bulletList", content: [
                "The background has been replaced with a 3D skybox which updates dynamically based on the cursor position.",
                "The settings section received an additional experimental customization setting.",
                "The home section has been completely reimagined, featuring information about the community, its goals, lore, and history.",
                "The information section was removed, as it is part of the home section now."
            ] },
            { type: "paragraph", content: "Okay, but what about the images? A pure text-based home section looks a bit bland. Yes, I was thinking about that as well, but as of right now, I don't have any images to add. I will perhaps add them at a future date. In any case, by completing the rebrand entirely, the dreamland's theme and goals should now be clear." }
        ],
        postImages: {},
        postSignature: postSignatures.drawing_pad,
        irrelevant: false
    },
    post4: {
        postHeader: "Silent Changes and Necessary Rebrand",
        postDate: "23rd of November 2024",
        postBody: [
            { type: "paragraph", content: "By now, it should be clear to community members that the Sublimity brand is being retired entirely, with Paddy's Dreamland taking center stage. Before explaining the reasons behind this rebrand, let's go over the changes to the website." },
            { type: "bulletList", content: [
                "As of this writing, the Home and Information sections have been wiped entirely. The website is gradually adapting to its new theme and branding. It's only a matter of time before new Home and Information sections are introduced.",
                "Several subtle changes have been made, with the new logo being the most noticeable. The animated background has been removed as it consumed significant resources and negatively impacted users on slower devices.",
                "A silent but important update: caching has been disabled. This ensures visitors always receive the latest content without being served outdated files. Setting this up was a real challenge!",
                "Major CSS and media query fixes have been implemented, improving the site's appearance and usability on mobile devices.",
                "A new and visually appealing loading screen has been introduced. It's simple, but it does the job effectively.",
                "Paddy's Dreamland was initially designed as a web app. Now that it's received fixes and tweaks, I highly recommend downloading it from your browser! Look for the \"Install Paddy's Dreamland\" button. This is especially useful for users who frequently return for the dynamic music on mobile devices. The music will continue to play in the background, even when the screen is turned off."
            ] },
            { type: "paragraph", content: "With the changes covered, let me explain why it was necessary to fully rebrand to Paddy's Dreamland." },
            { type: "bulletList", content: [
                "The rebrand was essential to create a more welcoming environment for the community. Negative patterns observed during the Sublimity era impacted multiple members, including myself. Now, the community is starting to feel like a true home.",
                "This rebrand shifts the focus to fostering a more supportive and inclusive atmosphere, particularly for members who appreciate a softer, more comforting environment.",
                "The Roblox group has been renamed to \"<a href=\"https://www.roblox.com/communities/8060970\">Paddy's Projects</a>.\" It now serves as a side/development group for official projects in Paddy's Dreamland. Meanwhile, a previously established group, \"<a href=\"https://www.roblox.com/communities/12808712\">Paddy's Dreamland</a>,\" has become the main group.",
                "To clarify, we are not disbanding. We will continue to operate as we always have, albeit under a new theme and with updated rules.",
                "You might wonder, \"Who's the character in the icon and banner?\" Allow me to introduce A.R.I.A. ASTRAL, our new mascot and the face of Paddy's Dreamland!"
            ] },
            { type: "paragraph", content: "That should cover everything! If I've missed anything, rest assured it will be addressed soon. I hope you understand the direction we're taking and have no issues moving forward. If you have any questions, ask me on Discord. Take care!" },
        ],
        postImages: {},
        postSignature: postSignatures.drawing_pad,
        irrelevant: false
    },
    post3: {
        postHeader: "New Source-themed Game in Development",
        postDate: "7th of October 2024",
        postBody: [
            { type: "paragraph", content: "While I did mention that I'm quite busy, things can get boring, and working on a small indie game doesn't hurt." },
            { type: "paragraph", content: "So, what's the game? The game is called Fragmented Worlds: Source. It's an atmospheric exploration experience where players navigate various worlds, each inspired by different styles of music. As you explore, you'll encounter unique environments, hidden secrets, and puzzles, all while discovering underrated, non-copyrighted tracks that shape the mood of each map. Progress is saved seamlessly, and the world unfolds based on the paths you take." },
            { type: "paragraph", content: "To motivate myself to update the website more frequently, I'm introducing a new section called Showcase. Similar to the channel in the Discord server, I'll be posting media related to my projects here. However, instead of posting content frequently, I'll focus on documenting my work and compiling relevant videos and screenshots. By the end of the day, week, or even month (depending on how busy things get), I'll provide the Showcase section with detailed updates about Fragmented Worlds: Source and future games." },
            { type: "paragraph", content: "See you all next weekend!" }
        ],
        postImages: {},
        postSignature: postSignatures.drawing_pad,
        irrelevant: true
    },
    post2: {
        postHeader: "Recreation of Paddy's Dreamland",
        postDate: "20th of September 2024",
        postBody: [
            { type: "paragraph", content: "Here it is, Paddy's Dreamland as a website has been remade. The previous version had a few issues I simply couldn't ignore, so I remade it from the ground up. Here are the general issues that the previous website had:" },
            { type: "bulletList", content: [
                "Improper handling of sub-pixels, which caused the website to appear blurry. Especially one pixel horizontal rules which would appear as if they are two pixels in height and a bit transparent.",
                "Terrible optimization. For example, the high-resolution background video, and possibly some JavaScript related code.",
                "The design felt a bit strange. I can't exactly remember what made me pick a magenta color scheme, but I'm glad I got rid of it.",
                "Some features such as the splash text at the top of the page would often desynchronize and flicker."
            ] },
            { type: "paragraph", content: "With those issues being resolved, I also decided to add some more features and flair to the page. The new additions are designed to give people a good first impression of the website, I hope you like it." },
            { type: "paragraph", content: "If you are curious about what changed, here are some general points about the changes that occurred:" },
            { type: "bulletList", content: [
                "The main navigation buttons now have silk icons, which adds more style.",
                "The social links now have a similar style to the main navigation buttons.",
                "Several HTML structure and CSS reworks.",
                "A new background video, which is also optimized.",
                "And other features you will most likely discover yourself."
            ] },
            { type: "paragraph", content: "That's everything from me for now." },
        ],
        postImages: {},
        postSignature: postSignatures.drawing_pad,
        irrelevant: false
    },
    post1: {
        postHeader: "Pausing Projects to Focus on Growth",
        postDate: "17th of September 2024",
        postBody: [
            { type: "paragraph", content: "I want to give a quick update on my current situation. As many of you know, I've started a software development apprenticeship, and it's been keeping me very busy. Because of this, I'll need to put most of my projects on hold for at least three years while I focus on learning and growing in my apprenticeship." },
            { type: "paragraph", content: "During this time, the only projects I'll be able to work on are those that support my apprenticeship, such as my website, or any new projects I come up with that might help me build relevant skills. I appreciate your understanding and support." },
            { type: "paragraph", content: "I may be able to revisit some of my previous projects during holiday breaks, but we'll see how things go." },
        ],
        postImages: {},
        postSignature: postSignatures.drawing_pad,
        irrelevant: true
    }
}