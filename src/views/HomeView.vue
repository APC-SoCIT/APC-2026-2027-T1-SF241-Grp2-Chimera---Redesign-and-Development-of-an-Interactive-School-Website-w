<script setup lang="ts">
import { computed } from "vue";
import { RouterLink } from "vue-router";
import EventCard from "@/components/EventCard.vue";
import { partitionEvents, formatPublicationDate } from "@/lib/content/dates";
import { usePublicContactDetails } from "@/lib/cms/contact";
import { phoneHref } from "@/lib/content/contact";
import { usePublicWebsite } from "@/lib/cms/public-website";

const website = usePublicWebsite();
const { pages } = website;
const news = computed(() => website.announcements.value.filter((item) => item.slug !== "office-transactions").slice(0, 3));
const calendar = computed(() => partitionEvents(website.events.value));
const dates = computed(() => (calendar.value.upcoming.length ? calendar.value.upcoming : calendar.value.past).slice(0, 3));
const school = usePublicContactDetails();
const levels = [
  { title: "Early years", grades: "Nursery & Kindergarten", copy: "A child's first steps in the school community.", group: "preschool" },
  { title: "Elementary", grades: "Grades 1–6", copy: "Building foundations for learning and character.", group: "grade-1" },
  { title: "Junior high school", grades: "Grades 7–10", copy: "Growing in knowledge, responsibility, and faith.", group: "grade-7" },
  { title: "Senior high school", grades: "Grades 11–12", copy: "Preparing for the next stage of a learner's journey.", group: "senior-high" },
];
const questions = [
  { title: "Which grade levels does SNCS offer?", answer: "SNCS serves nursery and kindergarten, elementary, junior high school, and senior high school learners. Contact the Registrar for current grade-level availability and senior high school strand requirements.", link: "/admissions", label: "Explore admission requirements" },
  { title: "How do we begin the admissions process?", answer: "Choose your applicant group, review its document checklist, and contact the Registrar to confirm requirements, entrance examinations, and enrollment dates before submitting your application.", link: "/admissions", label: "View the checklists" },
  { title: "Where can we ask about tuition and fees?", answer: "The Finance Office can provide current school fees and payment information for your child's grade level. Call (02) 8866-0281 or email sncsfinance@gmail.com.", link: "/contact#finance", label: "Contact the Finance Office" },
  { title: "Can we visit the campus?", answer: "Contact the school before your visit to ask about an available date and arrangements. The school is on Sampaloc Street in North Signal Village, Taguig City.", link: "/contact?topic=visit#inquiry", label: "Ask about a campus visit" },
];
</script>

<template>
  <section class="school-hero" aria-labelledby="school-name">
    <img class="school-hero-photo" src="/images/source-site/campus-front.jpg" alt="The welcoming entrance and landscaped courtyard of Sto. Niño Catholic School" width="960" height="541" fetchpriority="high" />
    <div class="container school-hero-content">
      <p class="eyebrow light">Catholic education · Nursery to Senior High</p>
      <h1 id="school-name">Forming learners<br />for lives of purpose.</h1>
      <p>A joyful learning community where faith, character,<br class="desktop-break" /> and academic growth come together.</p>
      <div class="hero-actions">
        <RouterLink class="button button-primary" to="/admissions">Explore admissions</RouterLink>
        <RouterLink class="button button-outline-light" to="/contact?topic=visit#inquiry">Plan a campus visit</RouterLink>
      </div>
      <span class="hero-location">Sto. Niño Catholic School, Inc. · Signal Village, Taguig City</span>
    </div>
  </section>

  <nav class="parent-shortcuts container" aria-label="For prospective families">
    <RouterLink to="/#learning-levels"><small>Find your child's next step</small><strong>Learning levels</strong></RouterLink>
    <RouterLink to="/admissions"><small>Start your SNCS journey</small><strong>Admissions & requirements</strong></RouterLink>
    <RouterLink to="/contact#finance"><small>Get current information</small><strong>Tuition & fee inquiries</strong></RouterLink>
    <RouterLink to="/contact?topic=visit#inquiry"><small>Come and get to know us</small><strong>Visit the campus</strong></RouterLink>
  </nav>

  <section class="section school-introduction">
    <div class="container introduction-layout">
      <div><p class="eyebrow">Welcome to Sto. Niño Catholic School</p><h2>A community for learning.<br />A foundation for life.</h2><p class="lead-copy">Rooted in faith and connected with home and parish, SNCS brings Catholic formation and school life together in the heart of Taguig.</p><RouterLink class="text-link" to="/about">Discover our story</RouterLink></div>
      <div class="heritage-note"><span>Growing with our community since</span><strong>1988</strong><p>From 28 kindergarten pupils to a school community spanning nursery through senior high school.</p><a href="https://www.sncstaguig.com/about/sto-ni%C3%B1o-catholic-school/school-history">Explore the school's history</a></div>
    </div>
  </section>

  <section id="learning-levels" class="section learning-section scroll-target" aria-labelledby="learning-title">
    <div class="container">
      <div class="editorial-heading"><div><p class="eyebrow">Learning at SNCS</p><h2 id="learning-title">Every stage of growing up.</h2></div><p>Find the admission guidance for your child's next chapter. Our Registrar can help with availability and requirements.</p></div>
      <div class="learning-grid"><article v-for="level in levels" :key="level.title" class="learning-level"><p class="level-grades">{{ level.grades }}</p><h3>{{ level.title }}</h3><p>{{ level.copy }}</p><RouterLink :to="{ path: '/admissions', hash: '#requirements-' + level.group }">View requirements<span class="sr-only"> for {{ level.title }}</span></RouterLink></article></div>
    </div>
  </section>

  <section class="section admissions-feature" aria-labelledby="admissions-title">
    <div class="container admissions-feature-layout">
      <div><p class="eyebrow light">For prospective families</p><h2 id="admissions-title">Your SNCS journey<br />starts with a conversation.</h2><p>We're here to help you understand the requirements and prepare for your child's next step.</p><RouterLink class="button button-primary" to="/admissions">Admissions guide</RouterLink></div>
      <ol class="admission-steps">
        <li><span>1</span><div><h3>Ask and explore</h3><p>Connect with the Registrar about grade availability, requirements, and a campus visit.</p><RouterLink to="/contact?topic=admissions#inquiry">Ask about admissions</RouterLink></div></li>
        <li><span>2</span><div><h3>Prepare the documents</h3><p>Review the checklist for your applicant group and confirm examination arrangements.</p><RouterLink to="/admissions#requirements">Find your checklist</RouterLink></div></li>
        <li><span>3</span><div><h3>Follow the school's application steps</h3><p>Confirm the current enrollment process with the Registrar before submitting your requirements.</p><RouterLink to="/admissions#admissions-process">See the admissions steps</RouterLink></div></li>
      </ol>
    </div>
  </section>

  <section class="section campus-editorial" aria-labelledby="campus-heading">
    <div class="container">
      <div class="editorial-heading"><div><p class="eyebrow">Life on campus</p><h2 id="campus-heading">Room to learn.<br />Space to belong.</h2></div><div><p>Explore the classrooms, library, and shared spaces that are part of the school day.</p><RouterLink class="text-link" to="/campus">Explore campus life</RouterLink></div></div>
      <div class="campus-editorial-grid">
        <RouterLink class="campus-editorial-image" to="/campus"><img src="/images/source-site/san-lorenzo-ruiz-building.jpg" alt="San Lorenzo Ruiz Building, with classrooms on the SNCS campus" loading="lazy" width="960" height="720" /><span><small>OUR CAMPUS</small><strong>Where each school day begins.</strong></span></RouterLink>
        <div class="campus-editorial-side"><img src="/images/source-site/library.jpg" alt="Reading tables and bookshelves in the school library" loading="lazy" width="960" height="720" /><div><h3>The joy of discovery.</h3><p>A space for reading, research, and assignments, supported by the school's reading programs and online library resources.</p><RouterLink class="text-link" to="/campus">See our learning spaces</RouterLink></div></div>
      </div>
    </div>
  </section>

  <section class="section school-updates" aria-labelledby="updates-title">
    <div class="container school-updates-grid">
      <div><div class="section-row compact"><div><p class="eyebrow">From the community</p><h2 id="updates-title">School updates</h2></div><RouterLink class="text-link" to="/news">All updates</RouterLink></div>
        <article v-for="item in news" :key="item.id" class="editorial-news-item"><p class="meta">{{ item.category }} <span>· {{ item.publishedAt ? formatPublicationDate(item.publishedAt) : 'Publication date not provided' }}</span></p><h3><RouterLink :to="'/news/' + item.slug">{{ item.title }}</RouterLink></h3><p>{{ item.summary }}</p><RouterLink class="text-link" :to="'/news/' + item.slug">Read update<span class="sr-only">: {{ item.title }}</span></RouterLink></article>
        <p v-if="!news.length" class="muted-copy">New school updates will appear here when published.</p>
      </div>
      <div class="calendar-editorial"><p class="eyebrow">Dates & activities</p><h2>{{ calendar.upcoming.length ? 'Coming up at SNCS' : 'From the school calendar' }}</h2><p v-if="!calendar.upcoming.length" class="calendar-context">Previously announced activities are listed below. Check the school calendar for the latest dates.</p><div class="calendar-items"><EventCard v-for="event in dates" :key="event.id" :event="event" compact /></div><RouterLink class="text-link" to="/events#school-calendar">View the full school calendar</RouterLink></div>
    </div>
  </section>

  <section class="section alumni-editorial"><div class="container alumni-editorial-layout"><div><p class="eyebrow">The SNCS community</p><h2>Rooted here.<br />Carried forward.</h2><p>Our graduates bring the school's values of simplicity, humility, and competence into their lives beyond the classroom.</p><a class="text-link" href="https://www.sncstaguig.com/alumni">Explore alumni stories</a></div><figure><img src="/images/source-site/alumni-achievers.jpg" alt="The school's tribute to three SNCS alumni achievers" loading="lazy" width="1280" height="719" /><figcaption>From the school's alumni archive · Achievements celebrated in 2019.</figcaption></figure></div></section>

  <section class="section family-questions" aria-labelledby="family-questions-title"><div class="container faq-layout"><div><p class="eyebrow">A little guidance</p><h2 id="family-questions-title">Questions families ask.</h2><p>Find a starting point here, then talk with the school about your child's circumstances.</p><RouterLink class="text-link" to="/contact?topic=admissions#inquiry">Ask the Registrar</RouterLink></div><div class="faq-list"><details v-for="question in questions" :key="question.title"><summary>{{ question.title }}</summary><p>{{ question.answer }}</p><RouterLink class="text-link" :to="question.link">{{ question.label }}</RouterLink></details></div></div></section>

  <section id="current-families" class="section current-families scroll-target" aria-labelledby="current-families-title"><div class="container"><p class="eyebrow">Already part of SNCS?</p><h2 id="current-families-title">For current students and parents.</h2><div class="family-resources"><RouterLink to="/resources"><strong>Forms & downloads</strong><span>Taguig Learner's Certificate scholarship forms</span></RouterLink><RouterLink to="/events#school-calendar"><strong>School calendar</strong><span>Dates, activities, and school notices</span></RouterLink><a href="https://library.sncstaguig.edu.ph/"><strong>School library</strong><span>Reading and research resources</span></a><RouterLink to="/contact"><strong>School offices</strong><span>Find the right person to contact</span></RouterLink></div><div class="more-resources"><h3>More resources</h3><a href="https://www.sncstaguig.com/home#h.fvyo8xp2gi0z_l">Director's Daily Reflection</a><a href="https://www.psahelpline.ph/sncs">PSA document ordering</a><a href="https://www.facebook.com/messages/t/316900518777">School Facebook & feedback</a></div><ul v-if="pages.length" class="published-page-list"><li v-for="page in pages" :key="page.id"><RouterLink :to="{ name: 'published-pages', params: { slug: page.slug } }">{{ page.title }}</RouterLink></li></ul></div></section>

  <section class="visit-school" aria-labelledby="visit-school-title"><div class="container visit-school-layout"><div><p class="eyebrow light">Let's get to know each other</p><h2 id="visit-school-title">Visit us in Signal Village.</h2><p>{{ school.address }}</p><p class="visit-hours"><strong>School office hours</strong><br />{{ school.officeHours }}</p><div class="hero-actions"><RouterLink class="button button-primary" to="/contact?topic=visit#inquiry">Request a campus visit</RouterLink><a class="button button-outline-light" :href="phoneHref(school.mainPhone)">Call {{ school.mainPhone }}</a></div></div><div class="visit-details"><h3>Questions? We're here to help.</h3><p>Ask the Registrar about admissions and visit arrangements, or contact Finance for current tuition and fees.</p><a :href="'mailto:' + school.admissionsEmail">Email the Registrar</a><a href="https://www.google.com/maps/search/?api=1&amp;query=Sto.+Nino+Catholic+School+Sampaloc+Street+Taguig" target="_blank" rel="noopener noreferrer">Find SNCS on Google Maps<span class="sr-only"> (opens a new tab)</span></a></div></div></section>
</template>
