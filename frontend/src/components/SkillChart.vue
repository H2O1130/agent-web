<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { init, use, type EChartsType } from 'echarts/core'
import { BarChart } from 'echarts/charts'
import { GridComponent, TooltipComponent } from 'echarts/components'
import { SVGRenderer } from 'echarts/renderers'
import type { SkillStat } from '../types'

interface SkillChartProps {
  skills: SkillStat[]
  total: number
}

use([BarChart, GridComponent, TooltipComponent, SVGRenderer])

const props = defineProps<SkillChartProps>()

const element = ref<HTMLDivElement>()
let chart: EChartsType | undefined
let observer: ResizeObserver | undefined

const chartLabel = computed(() => {
  return props.skills
    .slice(0, 6)
    .map(skill => `${skill.name}，${skill.count}/${props.total}条样本提及`)
    .join('；')
})

function draw(): void {
  if (!chart) return

  const visibleSkills = props.skills.slice(0, 6).reverse()
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

  chart.setOption({
    animation: !reduceMotion,
    grid: { left: 100, right: 30, top: 8, bottom: 20 },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (params: { name: string; value: number }[]) => {
        const first = params[0]
        return `${first?.name}：${first?.value} / ${props.total} 条样本提及`
      },
    },
    xAxis: {
      type: 'value',
      max: props.total || 1,
      minInterval: 1,
      axisLabel: { color: '#696960', fontSize: 14 },
      splitLine: { lineStyle: { color: '#F0EFE9' } },
    },
    yAxis: {
      type: 'category',
      data: visibleSkills.map(skill => skill.name),
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: '#4E4E46', fontSize: 14 },
    },
    series: [
      {
        type: 'bar',
        data: visibleSkills.map(skill => skill.count),
        barWidth: 11,
        showBackground: true,
        backgroundStyle: { color: '#F5F3EC', borderRadius: 6 },
        itemStyle: { color: '#C3A04D', borderRadius: 6 },
        label: { show: true, position: 'right', color: '#765713', fontSize: 14 },
      },
    ],
  }, true)
}

onMounted(() => {
  if (!element.value) return

  chart = init(element.value, undefined, { renderer: 'svg' })
  draw()

  observer = new ResizeObserver(() => chart?.resize())
  observer.observe(element.value)
})

watch(
  () => [props.skills, props.total],
  async () => {
    await nextTick()
    draw()
  },
  { deep: true },
)

onBeforeUnmount(() => {
  observer?.disconnect()
  chart?.dispose()
})
</script>

<template>
  <div ref="element" class="skill-chart" role="img" :aria-label="chartLabel"></div>
</template>
