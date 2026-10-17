# Roadmap — ideas for what comes next

Items are grouped by theme and roughly ordered by how much they would add for the effort. ✅ marks what is already in the game.

## 1. Holidays and the Jewish calendar

Today the game only knows the day of the week (for the Shir Shel Yom). Every day is an ordinary weekday, and the Kodesh HaKodashim can never be entered.

**How it should work**
- **Holiday calendar in the menu.** Any holiday can be played at any time. Kids can practise the Yom Kippur Avodah in the days before Yom Kippur, since nobody will be on a phone on Shabbat, Yom Tov or Yom Kippur itself.
- ✅ **The game knows the Hebrew date.** The browser can work this out offline (`Intl.DateTimeFormat` with the `hebrew` calendar), so no library or server is needed.
  - On days when phones are used (Rosh Chodesh, Chol HaMoed, Chanukah), that day's content turns on by itself: *"Today is Rosh Chodesh Cheshvan!"*
  - Before Shabbat, Yom Tov and Yom Kippur it shows a countdown instead: *"Yom Kippur is in 5 days — practise the Kohen Gadol's Avodah!"*
  - The day should change at sunset, not midnight.

**Content, in suggested order**
1. ✅ **Rosh Chodesh:** the Musaf korbanot (2 bulls, 1 ram, 7 lambs and a goat for a Chatat), with the chatzotzrot blown over the korbanot (Bamidbar 28:11-15, 10:10).
2. **Yom Kippur:** the Avodah of the Kohen Gadol as a story, from Mishnah Yoma.
   - Change from the gold garments to white.
   - Bring the ketoret into the Kodesh HaKodashim. This is the only time the Paroches opens.
   - The goral for the two goats.
   - The people's answer, *Baruch Shem*.
3. **Sukkot:** the real Simchat Beit HaShoevah night (the night scene already exists), Nisuch HaMayim, and the aravot around the Mizbeach.
4. **Shabbat:** changing the Lechem HaPanim, the Musaf of two lambs, and the Mishmar changing over.
5. **Pesach:** the Korban Pesach in three groups with Hallel, and the Omer.
6. **Shavuot:** the Shtei HaLechem, and Bikkurim arriving with the flute.
7. **Rosh Hashanah:** the shofar and the Musaf.

## 2. Make it fun to come back to

- ✅ **The Payis (morning lottery).** Real and fun (Yoma 2:1-4, Tamid 1:2). Each morning starts with the Kohanim standing in a circle while the Memuneh counts fingers. The lottery picks your avodah for the day, so every day starts differently.
- ✅ **Visitors change each day** (the Todah, Asham and Bechor were added; more to come). Today the same 6 visitors come every time. Pick 3-4 from a larger group, and add new ones:
  - a Todah with its breads
  - a Nazir finishing his nezirut
  - a poor person's Mincha
  - a Metzora's birds
  - a convert's first korban
- **Afternoon Tamid and lighting the Menorah in the evening.** This makes the day a full circle.
- ✅ **The Leviim's music room.** In the instrument rooms under Ezrat Yisrael, a Levi plays a tune and you play it back.
- ✅ **Secret missions in the chambers:** the four corner chambers of Ezrat Nashim, and the Sanhedrin's Par He'elem Davar in Lishkat HaGazit.
- **More mini-games:**
  - Rabban Shimon ben Gamliel juggling eight burning torches at Simchat Beit HaShoevah (Sukkah 53a)
  - Ben Katin's *mukhni*, the wheel that lowered the Kiyor into the water every night (Yoma 3:10)
  - grinding the Ketoret: "hadek heitev, heitev hadek" as a rhythm game (Keritot 6b)
  - sorting donations into the 13 shofarot (Shekalim 6:5)
  - the Lishkat Chasha'im, where people gave in secret and the poor took in secret (Shekalim 5:6)
- **Photo mode.** Take a picture anywhere in the Mikdash and share it to the family chat. Easy to build, and kids love it.

## 3. Younger and older kids

- **Two age modes:**
  - **"Little Kohen" (about 4-7):** read-aloud on, shorter sentences, Guide me always on, no wrong answers.
  - **"Big Kohen" (about 8-12):** fuller explanations, quizzes in the Sefer, and mistakes cost a star.
- **Quiz in the Sefer.** Short questions built from the facts already collected ("Where is an Olah slaughtered?"), with stars for correct answers.
- **Parent and teacher view.** What the child has learned, with sources, for discussing at the Shabbat table or in class.

## 4. UI and phone polish

- ✅ **Hebrew language option.** This would make the game usable for Israeli kids. All the text is in one place, so it can be translated.
- **Bigger-text setting**, and **left-handed controls** (joystick on the right).
- **Full map.** Tap the minimap to open a big map of the Mikdash, then tap a place to have Guide me walk there.
- **Fewer words on screen.**
  - Use icons and short lines in dialogs.
  - Read every new line aloud when read-aloud is on.
  - Pause the read-aloud when the card is swiped away.
- **Heichal lighting.** The light from the windows is very bright behind the Menorah close-up. Soften it a little.
- **Hotspot labels** for the lamb check can still touch on very small phones.

## 5. Look and feel

- **Better characters:** simple facial expressions, smoother walking and hand animations for each avodah (raising hands for Birkat Kohanim, pouring, carrying).
- **A livelier crowd:** people arriving with animals and baskets, children on their parents' shoulders, Leviim walking to the Duchan.
- **Weather and seasons:** winter rain, Sukkot decorations, the Omer barley in spring.

## 6. Under the hood

- ✅ **Works offline.** Add a service worker so the installed app opens without internet (on trips, in the car). It is already installable, but needs a connection.
- **Automated play-tests in the repository.** The touch-only bots that played the whole game during development should run on every change through GitHub Actions. That catches broken quests before they go live.
- **Move a save to another device** using a short code.
- **Slow and old phones:** a lighter "battery saver" mode, and fewer textures on low-memory devices.

## 7. Coming back every day
- ✅ **🔥 Esh Tamid:** a Shabbat-safe daily streak that never goes out.
- ✅ **💎 The Choshen:** 12 stones from visitors of the 12 tribes, leading to a week as Kohen Gadol, with the Minchat Chavitin and the Tamid ceremony.
- ✅ **📜 Memunim:** first jobs with Gevini, Ben Gever and Beit Garmu.
- **More Memunim jobs:**
  - Petachya over the birds
  - Ben Arza's cymbal
  - Matitya ben Shmuel running the Payis
  - Elazar over the Paroches
  - Pinchas over the garments
- **Elazar's question of the day:** a bonus star for answering from your own Sefer.

