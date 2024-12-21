---
layout: default
title: social.
omit_footer: true
---

## social.

Thanks for visiting! You can typically find or contact me through any of the following:

<ul class="social-grid">
  {% for social in site.data.social %}
    <li>
      <i class="icon {{ social.icon }}"></i>
      {%- if social.url -%}
        <a href="{{ social.url }}" title="{{ social.username }}">
      {%- else -%}
        <span>
      {%- endif -%}
      {{ social.username }}
      {%- if social.url -%}
        </a>
      {%- else -%}
        </span>
      {%- endif -%}
      <span>&nbsp;-&nbsp;{{- social.description -}}</span>
    </li>
  {% endfor %}
</ul>

---

## 88x31.

{% for category in site.data.buttons %}
  <h3>{{ category.category }}</h3>
  <div class="social-buttons">
    {%- for button in category.buttons -%}
      <a href="{{ button.url }}" title="{{ button.title }}">
        <img
          src="{{ button.image }}"
          alt="{{ button.title }}"
          width="88"
          height="31"
          decoding="async"
          fetchpriority="low"
          loading="lazy"
        >
      </a>
    {%- endfor -%}
  </div>
{% endfor %}
