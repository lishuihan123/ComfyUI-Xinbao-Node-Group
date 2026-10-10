import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location("number_slider", Path(__file__).resolve().parents[1] / "number_slider.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class NumberSliderTests(unittest.TestCase):
    def test_float_step_and_both_output_types(self):
        self.assertEqual(module.XinbaoNumberSlider.RETURN_TYPES, ("FLOAT", "INT"))
        floating, integer = module.XinbaoNumberSlider().output(0, 1, .1, .26)
        self.assertEqual((floating, integer), (.3, 0))
        self.assertIsInstance(floating, float)
        self.assertIsInstance(integer, int)

    def test_ranges_steps_and_rounding(self):
        for start, end, step, value, expected in [
            (0, 1, .3, 1, (1., 1)), (0, 1, .1, -1, (0., 0)),
            (-2, 2, .5, -1.5, (-1.5, -2)), (0, 10, 1, 1.5, (2., 2)),
            (0, 1, .000001, .000003, (.000003, 0)),
            (5, 5, 1, 99, (5., 5)), (10, 20, 2, 15, (16., 16)),
            (0, 1, 5, 1, (1., 1)), (-1e9, 1e9, .000001, 1e9, (1e9, 1000000000)),
        ]:
            with self.subTest(start=start, end=end, step=step, value=value):
                self.assertEqual(module.slider_value(start, end, step, value), expected)

    def test_invalid_configuration(self):
        for args in [(2, 1, .1, 1), (0, 1, 0, .5), (0, 1, -1, .5), (0, 1, .0000001, .5), (0, 1, .1, float("nan"))]:
            with self.subTest(args=args), self.assertRaises(ValueError):
                module.slider_value(*args)


if __name__ == "__main__":
    unittest.main()
