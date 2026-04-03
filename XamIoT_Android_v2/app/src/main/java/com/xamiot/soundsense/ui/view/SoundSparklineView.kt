package com.xamiot.soundsense.ui.view

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.LinearGradient
import android.graphics.Paint
import android.graphics.RectF
import android.graphics.Shader
import android.graphics.DashPathEffect
import android.util.AttributeSet
import android.view.View

/**
 * Bar chart compact affichant jusqu'à 30 mesures soundPct (0–100).
 * Chaque barre est colorée avec un dégradé vert (0%) → rouge (100%).
 * Placeholder en pointillés si aucune donnée.
 */
class SoundSparklineView @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null,
    defStyleAttr: Int = 0
) : View(context, attrs, defStyleAttr) {

    private var values: List<Double> = emptyList()

    private val barPaint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val placeholderPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE
        strokeWidth = 2f
        color = Color.argb(64, 150, 150, 150)
        pathEffect = DashPathEffect(floatArrayOf(6f, 6f), 0f)
    }

    private val cornerRadius = 3f
    private val barRect = RectF()

    fun setValues(newValues: List<Double>) {
        values = newValues.takeLast(30)
        invalidate()
    }

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)

        if (values.isEmpty()) {
            // Placeholder en pointillés
            canvas.drawRoundRect(
                0f, 0f, width.toFloat(), height.toFloat(),
                4f, 4f, placeholderPaint
            )
            return
        }

        val n = values.size
        val gap = if (n > 1) 1f else 0f
        val barW = (width - gap * (n - 1)) / n

        for ((i, v) in values.withIndex()) {
            val pct = (v / 100.0).coerceIn(0.0, 1.0).toFloat()
            val barH = pct * height
            val x = i * (barW + gap)
            val y = height - barH

            barRect.set(x, y, x + barW.coerceAtLeast(1f), height.toFloat())

            // Dégradé vert → rouge selon la valeur
            val color = barColor(pct)
            val darkColor = colorWithAlpha(color, 0.85f)
            val lightColor = colorWithAlpha(color, 0.45f)

            barPaint.shader = LinearGradient(
                x + barW / 2, y,
                x + barW / 2, height.toFloat(),
                darkColor, lightColor,
                Shader.TileMode.CLAMP
            )

            canvas.drawRoundRect(barRect, cornerRadius, cornerRadius, barPaint)
        }
    }

    /**
     * Interpolation HSV : vert (120°) → jaune (60°) → rouge (0°)
     */
    private fun barColor(pct: Float): Int {
        val hue = 120f * (1f - pct)
        return Color.HSVToColor(floatArrayOf(hue, 0.82f, 0.88f))
    }

    private fun colorWithAlpha(color: Int, alpha: Float): Int {
        return Color.argb(
            (alpha * 255).toInt(),
            Color.red(color),
            Color.green(color),
            Color.blue(color)
        )
    }
}
