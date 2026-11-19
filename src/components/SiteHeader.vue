<script setup lang="ts">
import { ref, watch } from "vue";
import { RouterLink, useRoute } from "vue-router";

const menu = ref<HTMLDetailsElement | null>(null);
const route = useRoute();

const navigation = [
  { to: "/about", label: "About" },
  { to: "/#learning-levels", label: "Learning" },
  { to: "/campus", label: "Campus life" },
  { to: "/news", label: "News" },
  { to: "/contact", label: "Contact" },
];

function closeMenu() {
  if (menu.value) menu.value.open = false;
}

function dismissMenu(event: KeyboardEvent) {
  if (!menu.value?.open) return;
  event.preventDefault();
  closeMenu();
  menu.value.querySelector("summary")?.focus();
}

watch(() => route.fullPath, closeMenu);
</script>

<template>
  <header class="site-header">
    <div class="school-utility"><div class="container"><span>Faith · Excellence · Service</span><nav aria-label="Community links"><RouterLink to="/#current-families">Current families</RouterLink><RouterLink to="/events#school-calendar">School calendar</RouterLink><a href="tel:+63288379702">(02) 8837-9702</a></nav></div></div>
    <div class="container header-inner">
      <RouterLink class="brand" to="/" aria-label="Sto. Niño Catholic School home">
        <img
          class="brand-mark"
          src="/images/source-site/sncs-seal.png"
          alt=""
          width="52"
          height="52"
        />
        <span>
          <strong>Sto. Niño Catholic School, Inc.</strong>
          <small>Signal Village, Taguig City</small>
        </span>
      </RouterLink>

      <nav class="desktop-nav" aria-label="Primary navigation">
        <RouterLink class="button button-secondary nav-registration" to="/admissions">Admissions</RouterLink>
        <RouterLink v-for="item in navigation" :key="item.to" :to="item.to">
          {{ item.label }}
        </RouterLink>
      </nav>

      <details ref="menu" class="mobile-menu" @keydown.esc="dismissMenu">
        <summary>Menu</summary>
        <nav aria-label="Mobile navigation">
          <RouterLink class="mobile-registration" to="/admissions" @click="closeMenu">Admissions</RouterLink>
          <RouterLink
            v-for="item in navigation"
            :key="item.to"
            :to="item.to"
            @click="closeMenu"
          >
            {{ item.label }}
          </RouterLink>
        </nav>
      </details>
    </div>
  </header>
</template>
