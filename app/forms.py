"""
forms.py —— 表单定义（Flask-WTF + WTForms）
==========================================
用类来声明每个表单的字段和校验规则，模板里直接渲染即可。
表单列表：
  - RegisterForm : 注册
  - LoginForm    : 登录
  - LinkForm     : 新增 / 编辑导航链接（含可选的分组选择）
  - GroupForm    : 新增 / 编辑分组

校验器（validators）说明：
  DataRequired : 必填
  Length       : 长度限制
  URL          : 必须为合法网址
  Optional     : 可留空
  EqualTo      : 两字段值必须相等（用于确认密码）
"""

from flask_wtf import FlaskForm
from wtforms import StringField, PasswordField, SubmitField, IntegerField, SelectField, BooleanField
from wtforms.validators import DataRequired, Length, URL, Optional, EqualTo


class RegisterForm(FlaskForm):
    """用户注册表单。"""
    username = StringField('用户名', validators=[
        DataRequired(message='用户名不能为空'),
        Length(min=3, max=80, message='用户名长度需在 3~80 个字符之间'),
    ])
    password = PasswordField('密码', validators=[
        DataRequired(message='密码不能为空'),
        Length(min=6, message='密码至少 6 位'),
    ])
    confirm = PasswordField('确认密码', validators=[
        DataRequired(message='请再次输入密码'),
        EqualTo('password', message='两次输入的密码不一致'),
    ])
    submit = SubmitField('注册')


class LoginForm(FlaskForm):
    """用户登录表单。"""
    username = StringField('用户名', validators=[DataRequired(message='请输入用户名')])
    password = PasswordField('密码', validators=[DataRequired(message='请输入密码')])
    submit = SubmitField('登录')


class LinkForm(FlaskForm):
    """新增 / 编辑导航链接的表单。"""
    title = StringField('标题', validators=[
        DataRequired(message='标题不能为空'),
        Length(max=120, message='标题最长 120 个字符'),
    ])
    url = StringField('链接地址', validators=[
        DataRequired(message='链接地址不能为空'),
        URL(message='请输入合法的网址（含 http/https）'),
    ])
    icon = StringField('图标', validators=[
        Optional(),                       # 允许留空
        Length(max=80, message='图标类名过长'),
    ])
    note = StringField('备注', validators=[
        Optional(),                       # 允许留空
        Length(max=200, message='备注最长 200 个字符'),
    ])
    # 清除已上传图标：SPA 在「改用内置图标/默认」时置 1，使 icon_url 清零；
    # Jinja 原生表单不传此字段，默认 False，行为不变。
    icon_url_clear = BooleanField('清除已上传图标', default=False)
    # 分组选择：choices 由路由动态填充（含"未分组"=0），coerce=int 让值以整数参与校验
    group_id = SelectField('分组', validators=[Optional()], coerce=int, default=0)
    sort_order = IntegerField('排序', validators=[Optional()], default=0)
    submit = SubmitField('保存')


class GroupForm(FlaskForm):
    """新增 / 编辑分组的表单。"""
    name = StringField('分组名称', validators=[
        DataRequired(message='分组名称不能为空'),
        Length(max=50, message='名称最长 50 个字符'),
    ])
    icon = StringField('图标', validators=[
        Optional(),
        Length(max=50, message='图标类名过长'),
    ])
    submit = SubmitField('保存')
