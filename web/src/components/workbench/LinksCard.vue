<script setup lang="ts">
import { computed, ref } from 'vue'
import WbCard from '../WbCard.vue'
import AppIcon from '../AppIcon.vue'
import { useWorkbenchStore } from '@/stores/workbench'
import { readIconFile } from '@/utils/iconUpload'

const wb = useWorkbenchStore()
const props = defineProps<{ iid: string }>()
const cfg = computed(() => wb.instConfig(props.iid) || {})

// —— 新增链接弹窗 ——
const creating = ref(false)
const newTitle = ref('')
const newUrl = ref('')
const newIcon = ref('')
const newIconUrl = ref('') // 图标图片链接（http(s)，可选）
const newIconData = ref('') // 上传图标转成的 data URL（可选）

function openCreate() {
  newTitle.value = ''
  newUrl.value = ''
  newIcon.value = ''
  newIconUrl.value = ''
  newIconData.value = ''
  creating.value = true
}
function closeCreate() {
  creating.value = false
}
function onIconFile(e: Event) {
  readIconFile(e, (d) => (newIconData.value = d))
}
function create() {
  if (!newUrl.value.trim()) return
  const iconImg = newIconData.value || newIconUrl.value
  wb.addLink(props.iid, newTitle.value, newUrl.value, newIcon.value, iconImg)
  closeCreate()
}
</script>

<template>
  <WbCard :iid="iid" icon="link">
    <template #actions>
      <button class="wb-cell__btn" @click="openCreate" aria-label="添加链接" title="添加链接">
        <AppIcon name="plus" :size="16" />
      </button>
    </template>

    <div class="wb-links">
      <a
        v-for="l in cfg.items"
        :key="l.id"
        class="wb-link"
        :href="l.url"
        target="_blank"
        rel="noopener"
      >
        <span class="wb-link__icon">
          <img v-if="l.iconImg" :src="l.iconImg" class="wb-link__img" alt="" />
          <AppIcon v-else :name="l.icon" :size="22" />
        </span>
        <span class="wb-link__title">{{ l.title }}</span>
      </a>
      <div v-if="cfg.items.length === 0" class="wb-muted" style="font-size: .85rem">
        还没有链接，点右上角 + 添加
      </div>
    </div>

    <Teleport to="body">
      <div v-if="creating" class="wb-pop__mask" @click.self="closeCreate">
        <div class="wb-pop">
          <div class="wb-pop__head">
            <span class="wb-pop__title">添加链接</span>
            <button class="wb-cell__btn" @click="closeCreate" aria-label="关闭"><AppIcon name="x" :size="14" /></button>
          </div>
          <div class="wb-pop__body">
            <div class="wb-dim">
              <span>名称</span>
              <input class="wb-input" v-model="newTitle" placeholder="如 GitHub" />
            </div>
            <div class="wb-dim" style="margin-top: .7rem">
              <span>网址</span>
              <input class="wb-input" v-model="newUrl" placeholder="https://…" />
            </div>
            <div class="wb-dim" style="margin-top: .7rem">
              <span>图标（Lucide 名）</span>
              <input class="wb-input" v-model="newIcon" placeholder="Lucide 图标名（留空=link）" />
            </div>
            <div class="wb-dim" style="margin-top: .7rem">
              <span>图标链接（图片 URL）</span>
              <input class="wb-input" v-model="newIconUrl" placeholder="https://…/icon.png（可选）" />
            </div>
            <div class="wb-dim" style="margin-top: .7rem">
              <span>上传图标</span>
              <label class="wb-file">
                <AppIcon name="upload" :size="14" />
                <span>{{ newIconData ? '已选图片（点击替换）' : '上传图标（jpg/png/svg）' }}</span>
                <input class="wb-file__input" type="file" accept="image/*,.svg" @change="onIconFile" />
              </label>
              <img v-if="newIconData" :src="newIconData" class="wb-file__preview" alt="图标预览" />
            </div>
          </div>
          <div class="wb-pop__foot">
            <button class="btn btn-sm btn-ghost" @click="closeCreate">取消</button>
            <button class="btn btn-sm" @click="create">添加</button>
          </div>
        </div>
      </div>
    </Teleport>
  </WbCard>
</template>
